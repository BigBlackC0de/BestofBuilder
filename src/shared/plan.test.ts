import { describe, expect, it } from 'vitest'
import {
  buildPlan,
  chapterWarning,
  formatChapters,
  formatTimestamp,
  planChapters,
  type PlanInput
} from './plan'

const clip = (title: string, durationSec: number): PlanInput => ({
  kind: 'clip',
  title,
  startSec: 0,
  durationSec
})

describe('buildPlan', () => {
  it('sans transition : durée = somme des clips', () => {
    const plan = buildPlan([clip('A', 30), clip('B', 45.5)], 60, 'none', 0.5)
    expect(plan.overlaps).toEqual([0])
    expect(plan.totalFrames).toBe(1800 + 2730)
  })

  it('avec transition : chaque raccord chevauche la durée demandée', () => {
    const plan = buildPlan([clip('A', 30), clip('B', 30), clip('C', 30)], 60, 'fade', 0.5)
    expect(plan.overlaps).toEqual([30, 30])
    expect(plan.items.map((i) => [i.headFrames, i.tailFrames])).toEqual([
      [0, 30],
      [30, 30],
      [30, 0]
    ])
    expect(plan.totalFrames).toBe(5400 - 60)
  })

  it('raccourcit la transition pour un clip très court', () => {
    const plan = buildPlan([clip('A', 30), clip('B', 1.2), clip('C', 30)], 60, 'fade', 1)
    // 1,2 s = 72 images → au plus 24 images par transition.
    expect(plan.overlaps).toEqual([24, 24])
  })

  it('coupe franche si le clip est trop court pour une transition', () => {
    const plan = buildPlan([clip('A', 30), clip('B', 0.05)], 60, 'fade', 1)
    expect(plan.overlaps).toEqual([0])
  })

  it('compte en images entières à l’ips de sortie', () => {
    const plan = buildPlan([clip('A', 12.345)], 30, 'fade', 0.5)
    expect(plan.items[0]?.frames).toBe(370)
    expect(plan.totalFrames).toBe(370)
  })
})

describe('chapitres', () => {
  it('intro à 00:00 puis chaque clip au milieu de sa transition', () => {
    const plan = buildPlan(
      [
        { kind: 'intro', title: '', startSec: 0, durationSec: 5 },
        clip('Le clutch', 40),
        clip('Fou rire', 30),
        { kind: 'outro', title: '', startSec: 0, durationSec: 8 }
      ],
      60,
      'fade',
      1
    )
    // Transitions de 60 images (1 s). Clip 1 : 5 s - 1 s + 0,5 s = 4,5 s → 4.
    // Clip 2 : début à 5 + 40 - 2 = 43 s, milieu à 43,5 s → 43.
    expect(planChapters(plan)).toEqual([
      { startSec: 0, title: 'Intro' },
      { startSec: 4, title: 'Le clutch' },
      { startSec: 43, title: 'Fou rire' }
    ])
  })

  it('sans intro, le premier clip commence à 00:00', () => {
    const plan = buildPlan([clip('A', 20), clip('B', 20)], 30, 'none', 0.5)
    expect(planChapters(plan)).toEqual([
      { startSec: 0, title: 'A' },
      { startSec: 20, title: 'B' }
    ])
  })

  it('formate au format YouTube', () => {
    expect(formatTimestamp(187, false)).toBe('03:07')
    expect(formatTimestamp(3787, true)).toBe('1:03:07')
    expect(formatTimestamp(3787, false)).toBe('63:07')
    expect(
      formatChapters(
        [
          { startSec: 0, title: 'Intro' },
          { startSec: 65, title: 'Le clutch' }
        ],
        600
      )
    ).toBe('00:00 Intro\n01:05 Le clutch')
  })

  it('prévient si YouTube risque d’ignorer les chapitres', () => {
    expect(chapterWarning([{ startSec: 0, title: 'A' }], 60)).toContain('au moins 3')
    expect(
      chapterWarning(
        [
          { startSec: 0, title: 'A' },
          { startSec: 30, title: 'B' },
          { startSec: 35, title: 'C' }
        ],
        90
      )
    ).toContain('« B »')
    expect(
      chapterWarning(
        [
          { startSec: 0, title: 'A' },
          { startSec: 30, title: 'B' },
          { startSec: 60, title: 'C' }
        ],
        90
      )
    ).toBeNull()
  })
})
