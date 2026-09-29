import { existsSync } from 'node:fs'
import ffmpegStatic from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'
import { AppError } from '../errors'

/**
 * Une fois l'appli packagÃ©e, les chemins fournis par ffmpeg-static / ffprobe-static pointent dans
 * `app.asar`, oÃ¹ l'on ne peut rien exÃ©cuter : les binaires sont dÃ©compressÃ©s dans `app.asar.unpacked`.
 */
export function unpackedPath(p: string): string {
  return p.replace(/app\.asar([/\\])/, 'app.asar.unpacked$1')
}

function resolveBinary(raw: string | null | undefined, name: string): string {
  const p = raw ? unpackedPath(raw) : null
  if (!p || !existsSync(p)) {
    throw new AppError({
      message: `Le composant vidÃ©o Â« ${name} Â» est introuvable.`,
      action: 'RÃ©installe BestofBuilder pour le restaurer.'
    })
  }
  return p
}

export const ffmpegPath = (): string => resolveBinary(ffmpegStatic, 'ffmpeg')
export const ffprobePath = (): string => resolveBinary(ffprobeStatic.path, 'ffprobe')
