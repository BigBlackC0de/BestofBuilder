/** Formate une durée en secondes : « 0:42 », « 12:05 », « 1:02:09 ». */
export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

/** Temps au centième, pour la découpe : « 0:12,40 », « 12:03,05 ». */
export function formatPrecise(totalSec: number): string {
  const cs = Math.max(0, Math.round(totalSec * 100))
  const m = Math.floor(cs / 6000)
  const s = Math.floor((cs % 6000) / 100)
  return `${m}:${String(s).padStart(2, '0')},${String(cs % 100).padStart(2, '0')}`
}

/** Durée lisible pour un temps restant ou écoulé : « 42 s », « 3 min 05 s », « 1 h 02 min ». */
export function formatSpan(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec))
  if (s < 60) return `${s} s`
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`
  return `${m} min ${String(s % 60).padStart(2, '0')} s`
}

/** Formate une taille de fichier en Mo / Go (virgule décimale française). */
export function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  const text = mb >= 1024 ? `${(mb / 1024).toFixed(1)} Go` : `${mb.toFixed(mb < 10 ? 1 : 0)} Mo`
  return text.replace('.', ',')
}

/** Libellé court d'une résolution : « 1080p », « 1440p », sinon « LxH ». */
export function formatResolution(width: number, height: number): string {
  const standard = [720, 1080, 1440, 2160]
  return width > height && standard.includes(height) ? `${height}p` : `${width}×${height}`
}
