/** Semaine ISO 8601 (la semaine 1 contient le premier jeudi de l'année). */
export function isoWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7)
  return { year: d.getUTCFullYear(), week }
}

/** « Best-of - semaine AAAA-SS.mp4 » pour la semaine de la date donnée. */
export function defaultOutputName(date: Date): string {
  const { year, week } = isoWeek(date)
  return `Best-of - semaine ${year}-${String(week).padStart(2, '0')}.mp4`
}

/** Rend un nom de fichier valide sous Windows et garantit l'extension .mp4. */
export function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*]/g, '-')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/\.mp4$/i, '')
    .trim()
    .replace(/[. ]+$/, '')
  return `${cleaned || 'Best-of'}.mp4`
}
