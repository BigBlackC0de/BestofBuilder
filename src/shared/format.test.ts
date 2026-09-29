import { describe, expect, it } from 'vitest'
import { formatDuration, formatPrecise, formatResolution, formatSize, formatSpan } from './format'

describe('format', () => {
  it('formatPrecise', () => {
    expect(formatPrecise(12.4)).toBe('0:12,40')
    expect(formatPrecise(723.049)).toBe('12:03,05')
    expect(formatPrecise(59.999)).toBe('1:00,00')
  })

  it('formatSpan', () => {
    expect(formatSpan(42.4)).toBe('42 s')
    expect(formatSpan(185)).toBe('3 min 05 s')
    expect(formatSpan(3725)).toBe('1 h 02 min')
  })

  it('formatDuration', () => {
    expect(formatDuration(42.9)).toBe('0:42')
    expect(formatDuration(725)).toBe('12:05')
    expect(formatDuration(3729)).toBe('1:02:09')
    expect(formatDuration(-3)).toBe('0:00')
  })

  it('formatSize utilise la virgule', () => {
    expect(formatSize(5 * 1024 * 1024)).toBe('5,0 Mo')
    expect(formatSize(250 * 1024 * 1024)).toBe('250 Mo')
    expect(formatSize(1.5 * 1024 ** 3)).toBe('1,5 Go')
  })

  it('formatResolution', () => {
    expect(formatResolution(1920, 1080)).toBe('1080p')
    expect(formatResolution(1080, 1920)).toBe('1080×1920')
    expect(formatResolution(1600, 900)).toBe('1600×900')
  })
})
