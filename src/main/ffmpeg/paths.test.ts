import { describe, expect, it } from 'vitest'
import { unpackedPath } from './paths'

describe('unpackedPath', () => {
  it('redirige vers app.asar.unpacked une fois packagé', () => {
    expect(
      unpackedPath(
        'C:\\Program Files\\BestofBuilder\\resources\\app.asar\\node_modules\\ffmpeg-static\\ffmpeg.exe'
      )
    ).toBe(
      'C:\\Program Files\\BestofBuilder\\resources\\app.asar.unpacked\\node_modules\\ffmpeg-static\\ffmpeg.exe'
    )
  })

  it('ne touche pas au chemin en développement', () => {
    const dev = 'C:\\dev\\node_modules\\ffmpeg-static\\ffmpeg.exe'
    expect(unpackedPath(dev)).toBe(dev)
  })
})
