import { existsSync, statSync } from 'node:fs'
import { basename } from 'node:path'
import { MEDIA_SCHEME, type AssetInfo, type AssetKind, type Settings } from '@shared/types'
import { parseProbe, probeArgs, type ProbeInfo } from './ffmpeg/commands'
import { ffprobePath } from './ffmpeg/paths'
import { runProcess } from './ffmpeg/run'

export const ASSET_PATH_KEY = {
  intro: 'introPath',
  outro: 'outroPath',
  watermark: 'watermarkPath'
} as const satisfies Record<AssetKind, keyof Settings>

const probeCache = new Map<string, ProbeInfo | null>()

/** Analyse une vidéo d'habillage (intro/outro). null si illisible. Mis en cache. */
export async function probeAsset(path: string): Promise<ProbeInfo | null> {
  const key = `${path}|${statSync(path).mtimeMs}`
  if (!probeCache.has(key)) {
    const result = await runProcess(ffprobePath(), probeArgs(path)).catch(() => null)
    let info: ProbeInfo | null = null
    try {
      if (result?.code === 0) info = parseProbe(result.stdout)
    } catch {
      info = null
    }
    probeCache.set(key, info)
  }
  return probeCache.get(key) ?? null
}

export async function assetInfo(kind: AssetKind, path: string | null): Promise<AssetInfo | null> {
  if (!path) return null
  const fileName = basename(path)
  if (!existsSync(path)) {
    return { fileName, durationSec: null, previewUrl: null, problem: 'Fichier introuvable' }
  }
  if (kind === 'watermark') {
    const version = Math.round(statSync(path).mtimeMs)
    return {
      fileName,
      durationSec: null,
      previewUrl: `${MEDIA_SCHEME}://asset/watermark?v=${version}`,
      problem: null
    }
  }
  const info = await probeAsset(path)
  return info
    ? { fileName, durationSec: info.durationSec, previewUrl: null, problem: null }
    : { fileName, durationSec: null, previewUrl: null, problem: 'Vidéo illisible' }
}
