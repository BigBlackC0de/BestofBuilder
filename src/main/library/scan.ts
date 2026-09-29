import { createHash } from 'node:crypto'
import { readdir, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { VIDEO_EXTENSIONS, type ClipEntry, type ScanResult } from '@shared/types'
import { AppError } from '../errors'
import { registerClip, resetRegistry } from './registry'

const accepted = new Set<string>(VIDEO_EXTENSIONS)

export function clipId(path: string): string {
  return createHash('sha1').update(path).digest('hex').slice(0, 16)
}

/** Liste les vidéos du dossier (non récursif), triées par date de création. */
export async function scanFolder(folder: string): Promise<ScanResult> {
  let names: string[]
  try {
    names = await readdir(folder)
  } catch (err) {
    throw new AppError(
      {
        message: 'Impossible d’ouvrir le dossier « ' + folder + ' ».',
        action: 'Vérifie qu’il existe toujours (disque branché ?) puis choisis-le à nouveau.'
      },
      { cause: err }
    )
  }

  resetRegistry()
  const clips: ClipEntry[] = []
  for (const fileName of names) {
    if (!accepted.has(extname(fileName).toLowerCase())) continue
    const path = join(folder, fileName)
    const info = await stat(path).catch(() => null)
    if (!info?.isFile()) continue
    const id = clipId(path)
    registerClip(id, { path, sizeBytes: info.size, mtimeMs: info.mtimeMs })
    clips.push({
      id,
      fileName,
      sizeBytes: info.size,
      // birthtime peut valoir 0 sur certains systèmes de fichiers : repli sur la date de modification.
      createdAt: info.birthtimeMs > 0 ? info.birthtimeMs : info.mtimeMs
    })
  }

  clips.sort((a, b) => a.createdAt - b.createdAt || a.fileName.localeCompare(b.fileName, 'fr'))
  return { folder, clips }
}
