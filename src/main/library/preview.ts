import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { app } from 'electron'
import { MEDIA_SCHEME } from '@shared/types'
import { AppError } from '../errors'
import { ffmpegPath } from '../ffmpeg/paths'
import { runProcess } from '../ffmpeg/run'
import { getClip, registerPreview } from './registry'

/** Formats que le lecteur intégré lit directement. */
const PLAYABLE = new Set(['.mp4', '.mov', '.webm'])

export function previewDir(): string {
  return join(app.getPath('temp'), 'BestofBuilder', 'previews')
}

const remuxArgs = (input: string, output: string, audio: 'copy' | 'aac') => [
  '-hide_banner',
  '-loglevel',
  'error',
  '-nostdin',
  '-y',
  '-i',
  input,
  '-map',
  '0:v:0',
  '-map',
  '0:a:0?',
  '-c:v',
  'copy',
  ...(audio === 'copy' ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-b:a', '192k']),
  '-movflags',
  '+faststart',
  output
]

/**
 * Renvoie une URL lisible par la balise <video>. Les .mkv d'OBS sont recopiés en .mp4 sans
 * réencodage (quelques secondes, mis en cache) ; le fichier source n'est jamais modifié.
 */
export async function preparePreview(id: string): Promise<string> {
  const clip = getClip(id)
  if (!clip) {
    throw new AppError({
      message: 'Ce clip ne fait plus partie de la liste.',
      action: 'Clique sur « Actualiser » pour relire le dossier.'
    })
  }
  if (PLAYABLE.has(extname(clip.path).toLowerCase())) return `${MEDIA_SCHEME}://clip/${id}`

  const key = createHash('sha1')
    .update(`${clip.path}|${clip.sizeBytes}|${clip.mtimeMs}`)
    .digest('hex')
  const dir = previewDir()
  const output = join(dir, `${key}.mp4`)
  if (!existsSync(output)) {
    await mkdir(dir, { recursive: true })
    const temp = `${output}.part.mp4`
    let result = await runProcess(ffmpegPath(), remuxArgs(clip.path, temp, 'copy'))
    // Audio non compatible avec le .mp4 (ex. PCM) : on le convertit, la vidéo reste copiée.
    if (result.code !== 0)
      result = await runProcess(ffmpegPath(), remuxArgs(clip.path, temp, 'aac'))
    if (result.code !== 0) {
      await rm(temp, { force: true })
      throw new AppError({
        message: 'L’aperçu de ce clip n’a pas pu être préparé.',
        action: 'Tu peux quand même le découper en saisissant les temps à la main.'
      })
    }
    await rename(temp, output)
  }
  registerPreview(id, output)
  return `${MEDIA_SCHEME}://preview/${id}`
}
