import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { MEDIA_SCHEME, type ClipInfo } from '@shared/types'
import { AppError } from '../errors'
import { parseProbe, probeArgs, thumbnailArgs, thumbnailTime } from '../ffmpeg/commands'
import { ffmpegPath, ffprobePath } from '../ffmpeg/paths'
import { runProcess } from '../ffmpeg/run'
import { getClip, registerThumbnail } from './registry'

/** Limite le nombre de ffprobe/ffmpeg lancés en parallèle. */
const MAX_CONCURRENT = 4
let running = 0
const queue: (() => void)[] = []

async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT) await new Promise<void>((resolve) => queue.push(resolve))
  running++
  try {
    return await fn()
  } finally {
    running--
    queue.shift()?.()
  }
}

export function thumbnailDir(): string {
  return join(app.getPath('temp'), 'BestofBuilder', 'thumbs')
}

export async function analyzeClip(id: string): Promise<ClipInfo> {
  const clip = getClip(id)
  if (!clip) {
    throw new AppError({
      message: 'Ce clip ne fait plus partie de la liste.',
      action: 'Clique sur « Actualiser » pour relire le dossier.'
    })
  }

  return limited(async () => {
    const probe = await runProcess(ffprobePath(), probeArgs(clip.path))
    let info
    try {
      if (probe.code !== 0) throw new Error(probe.stderr)
      info = parseProbe(probe.stdout)
      clip.probe = info
    } catch (err) {
      throw new AppError(
        {
          message: 'Ce fichier vidéo n’a pas pu être lu.',
          action:
            'Il est peut-être corrompu ou encore en cours d’enregistrement. Vérifie qu’il s’ouvre dans un lecteur vidéo.'
        },
        { cause: err }
      )
    }

    // Miniature mise en cache : la clé change si le fichier est modifié.
    const key = createHash('sha1')
      .update(`${clip.path}|${clip.sizeBytes}|${clip.mtimeMs}`)
      .digest('hex')
    const dir = thumbnailDir()
    const thumbPath = join(dir, `${key}.jpg`)
    let thumbnailUrl: string | null = null
    if (!existsSync(thumbPath)) {
      await mkdir(dir, { recursive: true })
      await runProcess(
        ffmpegPath(),
        thumbnailArgs(clip.path, thumbPath, thumbnailTime(info.durationSec))
      ).catch((err: unknown) => console.error('Miniature impossible', err))
    }
    if (existsSync(thumbPath)) {
      registerThumbnail(id, thumbPath)
      thumbnailUrl = `${MEDIA_SCHEME}://thumb/${id}`
    }

    return { ...info, thumbnailUrl }
  })
}
