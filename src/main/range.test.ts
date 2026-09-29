import { describe, expect, it } from 'vitest'
import { parseRange } from './range'

describe('parseRange', () => {
  it('lit une plage complète', () =>
    expect(parseRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 }))
  it('lit une plage ouverte', () =>
    expect(parseRange('bytes=500-', 1000)).toEqual({ start: 500, end: 999 }))
  it('lit un suffixe', () =>
    expect(parseRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 }))
  it('borne la fin à la taille du fichier', () =>
    expect(parseRange('bytes=900-5000', 1000)).toEqual({ start: 900, end: 999 }))
  it('refuse une plage hors fichier ou invalide', () => {
    expect(parseRange('bytes=1000-', 1000)).toBeNull()
    expect(parseRange('bytes=50-10', 1000)).toBeNull()
    expect(parseRange('items=0-1', 1000)).toBeNull()
    expect(parseRange(null, 1000)).toBeNull()
  })
})
