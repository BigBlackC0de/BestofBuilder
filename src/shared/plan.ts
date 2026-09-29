/**
 * Plan de montage : durées en nombre d'images, chevauchements des transitions et chapitres.
 * Module pur, testable unitairement. Tout est compté en images à l'ips de sortie pour
 * qu'aucun arrondi ne s'accumule le long de la vidéo.
 */
import type { TransitionKind } from '@shared/types'

export type PlanItemKind = 'intro' | 'clip' | 'outro'

export interface PlanInput {
  kind: PlanItemKind
  title: string
  /** Point d'entrée dans la source (s). */
  startSec: number
  /** Durée gardée (s). */
  durationSec: number
}

export interface PlanItem extends PlanInput {
  frames: number
  /** Images partagées avec l'élément précédent (transition entrante). */
  headFrames: number
  /** Images partagées avec l'élément suivant (transition sortante). */
  tailFrames: number
}

export interface Plan {
  fps: number
  items: PlanItem[]
  /** Durée de chaque transition, en images (overlaps[i] : entre items[i] et items[i+1]). */
  overlaps: number[]
  totalFrames: number
}

/** Une transition ne mange jamais plus d'un tiers d'un élément. En dessous de 2 images, on coupe. */
export function buildPlan(
  inputs: readonly PlanInput[],
  fps: number,
  transition: TransitionKind,
  transitionSec: number
): Plan {
  const frames = inputs.map((i) => Math.max(1, Math.floor(i.durationSec * fps + 1e-6)))
  const wanted = transition === 'none' ? 0 : Math.round(transitionSec * fps)
  const overlaps = frames.slice(0, -1).map((f, i) => {
    const next = frames[i + 1] ?? 0
    const d = Math.min(wanted, Math.floor(f / 3), Math.floor(next / 3))
    return d >= 2 ? d : 0
  })
  const items = inputs.map((input, i) => ({
    ...input,
    frames: frames[i] ?? 1,
    headFrames: i > 0 ? (overlaps[i - 1] ?? 0) : 0,
    tailFrames: overlaps[i] ?? 0
  }))
  const totalFrames = frames.reduce((a, b) => a + b, 0) - overlaps.reduce((a, b) => a + b, 0)
  return { fps, items, overlaps, totalFrames }
}

export interface Chapter {
  startSec: number
  title: string
}

/**
 * Un chapitre par clip (plus « Intro »), placé au milieu de la transition entrante.
 * L'outro n'a pas de chapitre : elle prolonge le dernier.
 */
export function planChapters(plan: Plan): Chapter[] {
  const chapters: Chapter[] = []
  let start = 0
  plan.items.forEach((item, i) => {
    const incoming = i > 0 ? (plan.overlaps[i - 1] ?? 0) : 0
    const at = i === 0 ? 0 : Math.floor((start + incoming / 2) / plan.fps)
    if (item.kind !== 'outro') {
      chapters.push({ startSec: at, title: item.kind === 'intro' ? 'Intro' : item.title })
    }
    start += item.frames - (plan.overlaps[i] ?? 0)
  })
  return chapters
}

/** « 03:07 », ou « 1:03:07 » si la vidéo dépasse une heure. */
export function formatTimestamp(sec: number, withHours: boolean): string {
  const s = Math.max(0, Math.floor(sec))
  const pad = (n: number) => String(n).padStart(2, '0')
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return withHours ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m + h * 60)}:${pad(s % 60)}`
}

/** Liste à coller telle quelle dans la description YouTube. */
export function formatChapters(chapters: readonly Chapter[], totalSec: number): string {
  const withHours = totalSec >= 3600
  return chapters.map((c) => `${formatTimestamp(c.startSec, withHours)} ${c.title}`).join('\n')
}

/** YouTube ignore les chapitres s'il y en a moins de 3 ou si l'un dure moins de 10 s. */
export function chapterWarning(chapters: readonly Chapter[], totalSec: number): string | null {
  if (chapters.length < 3) {
    return 'YouTube demande au moins 3 chapitres pour les afficher.'
  }
  const short = chapters.filter((c, i) => {
    const end = chapters[i + 1]?.startSec ?? totalSec
    return end - c.startSec < 10
  })
  if (short.length > 0) {
    return `Chapitre${short.length > 1 ? 's' : ''} de moins de 10 s (${short
      .map((c) => `« ${c.title} »`)
      .join(', ')}) : YouTube pourrait ignorer tous les chapitres.`
  }
  return null
}
