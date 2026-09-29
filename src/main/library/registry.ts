/**
 * Registre des fichiers que le renderer a le droit d'afficher.
 * Le renderer ne connaît que des identifiants opaques ; le protocole `bob-media://`
 * refuse tout ce qui n'est pas enregistré ici.
 */
import type { ProbeInfo } from '../ffmpeg/commands'

interface ClipRecord {
  path: string
  sizeBytes: number
  mtimeMs: number
  /** Résultat ffprobe, une fois le clip analysé. */
  probe?: ProbeInfo
}

const clips = new Map<string, ClipRecord>()
const thumbnails = new Map<string, string>()
const previews = new Map<string, string>()

export function resetRegistry(): void {
  clips.clear()
  thumbnails.clear()
  previews.clear()
}

export function registerClip(id: string, record: ClipRecord): void {
  clips.set(id, record)
}

export function getClip(id: string): ClipRecord | undefined {
  return clips.get(id)
}

export function registerThumbnail(id: string, path: string): void {
  thumbnails.set(id, path)
}

export function getThumbnail(id: string): string | undefined {
  return thumbnails.get(id)
}

/** Fichier lisible par le lecteur intégré (copie .mp4 pour les .mkv). */
export function registerPreview(id: string, path: string): void {
  previews.set(id, path)
}

export function getPreview(id: string): string | undefined {
  return previews.get(id)
}
