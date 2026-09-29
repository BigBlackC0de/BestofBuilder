import { describe, expect, it } from 'vitest'
import { defaultOutputName, isoWeek, sanitizeFileName } from './naming'

describe('isoWeek', () => {
  it.each([
    [2026, 9, 29, 2026, 40],
    [2026, 1, 1, 2026, 1],
    [2027, 1, 1, 2026, 53],
    [2024, 12, 30, 2025, 1]
  ])('%d-%d-%d → %d semaine %d', (y, m, d, year, week) => {
    expect(isoWeek(new Date(y, m - 1, d))).toEqual({ year, week })
  })
})

describe('noms de fichier', () => {
  it('nom par défaut', () => {
    expect(defaultOutputName(new Date(2026, 8, 22))).toBe('Best-of - semaine 2026-39.mp4')
  })

  it('retire les caractères interdits et garantit .mp4', () => {
    expect(sanitizeFileName('Best-of: "top" 1/2?')).toBe('Best-of- -top- 1-2-.mp4')
    expect(sanitizeFileName('Mon best-of.MP4')).toBe('Mon best-of.mp4')
    expect(sanitizeFileName('  ...  ')).toBe('Best-of.mp4')
    expect(sanitizeFileName('Spécial été')).toBe('Spécial été.mp4')
  })
})
