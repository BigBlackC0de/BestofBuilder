import { describe, expect, it } from 'vitest'
import { parseFrameRate, parseProbe, probeArgs, thumbnailArgs, thumbnailTime } from './commands'

describe('parseFrameRate', () => {
  it.each([
    ['60/1', 60],
    ['30000/1001', 29.97],
    ['25', 25],
    ['0/0', 0],
    ['abc', 0],
    [undefined, 0]
  ])('%s → %d', (input, expected) => {
    expect(parseFrameRate(input)).toBe(expected)
  })
})

describe('thumbnailTime', () => {
  it('prend 1 s pour un clip normal', () => expect(thumbnailTime(45)).toBe(1))
  it('prend le milieu pour un clip très court', () => expect(thumbnailTime(1.2)).toBeCloseTo(0.6))
  it('reste à 0 pour une durée inconnue', () => {
    expect(thumbnailTime(0)).toBe(0)
    expect(thumbnailTime(Number.NaN)).toBe(0)
  })
})

describe('arguments ffmpeg/ffprobe', () => {
  const path = 'C:\\Users\\Streamer\\Vidéos\\Semaine 39\\Replay 2026-09-22 21-47-03.mkv'

  it('garde le chemin avec espaces et accents en un seul argument', () => {
    expect(probeArgs(path).at(-1)).toBe(path)
    const args = thumbnailArgs(path, 'C:\\tmp\\t.jpg', 1)
    expect(args[args.indexOf('-i') + 1]).toBe(path)
    expect(args.at(-1)).toBe('C:\\tmp\\t.jpg')
  })

  it('cherche avant -i (seek rapide) et ne sort qu’une image', () => {
    const args = thumbnailArgs('in.mp4', 'out.jpg', 1)
    expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'))
    expect(args[args.indexOf('-ss') + 1]).toBe('1.000')
    expect(args[args.indexOf('-frames:v') + 1]).toBe('1')
    expect(args).toContain('-y')
  })
})

describe('parseProbe', () => {
  const obsMkv = JSON.stringify({
    streams: [
      {
        codec_type: 'video',
        codec_name: 'h264',
        width: 2560,
        height: 1440,
        avg_frame_rate: '60/1'
      },
      { codec_type: 'audio', codec_name: 'aac' }
    ],
    format: { duration: '30.016000' }
  })

  it('lit un replay OBS (mkv sans durée par flux)', () => {
    expect(parseProbe(obsMkv)).toEqual({
      durationSec: 30.016,
      width: 2560,
      height: 1440,
      fps: 60,
      videoCodec: 'h264',
      audioCodec: 'aac',
      hasAudio: true
    })
  })

  it('détecte l’absence de piste audio', () => {
    const json = JSON.stringify({
      streams: [
        {
          codec_type: 'video',
          codec_name: 'h264',
          width: 1920,
          height: 1080,
          avg_frame_rate: '30/1'
        }
      ],
      format: { duration: '12.5' }
    })
    const info = parseProbe(json)
    expect(info.hasAudio).toBe(false)
    expect(info.audioCodec).toBeNull()
  })

  it('ignore une pochette intégrée et se replie sur r_frame_rate', () => {
    const json = JSON.stringify({
      streams: [
        {
          codec_type: 'video',
          codec_name: 'mjpeg',
          width: 300,
          height: 300,
          disposition: { attached_pic: 1 }
        },
        {
          codec_type: 'video',
          codec_name: 'hevc',
          width: 1920,
          height: 1080,
          avg_frame_rate: '0/0',
          r_frame_rate: '30000/1001',
          duration: '8.0'
        }
      ],
      format: {}
    })
    const info = parseProbe(json)
    expect(info.videoCodec).toBe('hevc')
    expect(info.fps).toBe(29.97)
    expect(info.durationSec).toBe(8)
  })

  it('refuse un fichier sans vidéo', () => {
    const json = JSON.stringify({
      streams: [{ codec_type: 'audio', codec_name: 'aac' }],
      format: {}
    })
    expect(() => parseProbe(json)).toThrow()
  })
})
