import { describe, expect, it } from 'vitest'
import {
  concatListContent,
  finalArgs,
  formatCommand,
  loudnormMeasureArgs,
  normalizeArgs,
  normalizeVideoFilter,
  parseLoudnorm,
  parseProgressLine,
  transitionArgs,
  videoEncoderArgs,
  type NormalizeOptions
} from './commands'

const valueAfter = (args: string[], flag: string, from = 0) => args[args.indexOf(flag, from) + 1]

describe('videoEncoderArgs', () => {
  it('NVENC haute qualité : preset p6, débit variable', () => {
    const args = videoEncoderArgs('h264_nvenc', 60, false)
    expect(valueAfter(args, '-c:v')).toBe('h264_nvenc')
    expect(valueAfter(args, '-preset')).toBe('p6')
    expect(valueAfter(args, '-rc')).toBe('vbr')
    expect(valueAfter(args, '-g')).toBe('120')
  })

  it('repli x264 : CRF 18, preset medium', () => {
    const args = videoEncoderArgs('libx264', 30, false)
    expect(valueAfter(args, '-c:v')).toBe('libx264')
    expect(valueAfter(args, '-crf')).toBe('18')
    expect(valueAfter(args, '-preset')).toBe('medium')
    expect(valueAfter(args, '-g')).toBe('60')
  })

  it('brouillon : réglages rapides', () => {
    expect(valueAfter(videoEncoderArgs('h264_nvenc', 30, true), '-preset')).toBe('p2')
    expect(valueAfter(videoEncoderArgs('libx264', 30, true), '-preset')).toBe('veryfast')
  })
})

describe('normalizeArgs', () => {
  const base: NormalizeOptions = {
    input: 'C:\\Vidéos\\Semaine 39\\Replay.mkv',
    hasAudio: true,
    startSec: 0,
    frames: 1800,
    fps: 60,
    encoder: 'h264_nvenc',
    draft: false,
    parts: [{ output: 'C:\\tmp\\body.mkv', fromFrame: 0, toFrame: 1800, lossless: false }]
  }
  const filterOf = (args: string[]) => valueAfter(args, '-filter_complex') ?? ''

  it('met à l’échelle 1080p avec bandes noires, SAR 1, ips fixe, yuv420p', () => {
    expect(normalizeVideoFilter(60)).toBe(
      'scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos,' +
        'pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=60,format=yuv420p'
    )
  })

  it('clip avec audio : audio 48 kHz stéréo, coupé au même nombre d’images que la vidéo', () => {
    const args = normalizeArgs(base)
    expect(args).not.toContain('lavfi')
    const filter = filterOf(args)
    expect(filter).toContain('[0:a:0]aresample=48000')
    expect(filter).toContain('channel_layouts=stereo')
    expect(filter).toContain('trim=end_frame=1800')
    // 1800 images à 60 ips = 30 s = 1 440 000 échantillons.
    expect(filter).toContain('atrim=end_sample=1440000')
    expect(valueAfter(args, '-c:a')).toBe('pcm_s16le')
    expect(valueAfter(args, '-i')).toBe(base.input)
    expect(args.at(-1)).toBe('C:\\tmp\\body.mkv')
  })

  it('clip muet : ajoute une piste silencieuse anullsrc', () => {
    const args = normalizeArgs({ ...base, hasAudio: false })
    expect(args).toContain('anullsrc=channel_layout=stereo:sample_rate=48000')
    expect(filterOf(args)).toContain('[1:a]aresample')
  })

  it('découpe : entrée avant -i, lecture limitée à la durée utile', () => {
    const args = normalizeArgs({ ...base, startSec: 2.5, frames: 600 })
    expect(valueAfter(args, '-ss')).toBe('2.500')
    expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'))
    expect(valueAfter(args, '-t')).toBe('11.000')
    expect(normalizeArgs(base)).not.toContain('-ss')
  })

  it('sépare début, corps et fin ; début et fin sans perte', () => {
    const args = normalizeArgs({
      ...base,
      parts: [
        { output: 'head.mkv', fromFrame: 0, toFrame: 30, lossless: true },
        { output: 'body.mkv', fromFrame: 30, toFrame: 1770, lossless: false },
        { output: 'tail.mkv', fromFrame: 1770, toFrame: 1800, lossless: true }
      ]
    })
    const filter = filterOf(args)
    expect(filter).toContain('split=3[vp0][vp1][vp2]')
    expect(filter).toContain('asplit=3[ap0][ap1][ap2]')
    expect(filter).toContain('[vp1]trim=start_frame=30:end_frame=1770')
    expect(filter).toContain('[ap1]atrim=start_sample=24000:end_sample=1416000')
    // Chaque sortie a ses propres réglages d'encodage, juste avant son fichier.
    const head = args.indexOf('head.mkv')
    const body = args.indexOf('body.mkv')
    expect(args.slice(0, head)).toContain('-qp')
    expect(valueAfter(args, '-c:v', head)).toBe('h264_nvenc')
    expect(body).toBeGreaterThan(head)
  })

  it('filigrane : image en boucle, taille, opacité, en bas à droite', () => {
    const args = normalizeArgs({
      ...base,
      hasAudio: false,
      watermark: { path: 'C:\\Logos\\logo été.png', widthPx: 230, opacity: 0.8 }
    })
    expect(args.slice(args.indexOf('-loop'), args.indexOf('-loop') + 4)).toEqual([
      '-loop',
      '1',
      '-i',
      'C:\\Logos\\logo été.png'
    ])
    const filter = filterOf(args)
    expect(filter).toContain('[1:v]scale=230:-1,format=rgba,colorchannelmixer=aa=0.80[wm]')
    expect(filter).toContain('overlay=W-w-32:H-h-32')
    // L'entrée silencieuse passe après le filigrane.
    expect(filter).toContain('[2:a]aresample')
  })
})

describe('transitionArgs', () => {
  it('xfade + acrossfade sur la durée exacte, même encodeur que le reste', () => {
    const args = transitionArgs({
      tail: 'A-tail.mkv',
      head: 'B-head.mkv',
      output: 'T1.mkv',
      kind: 'slideleft',
      frames: 30,
      fps: 60,
      encoder: 'h264_nvenc',
      draft: false
    })
    const filter = valueAfter(args, '-filter_complex')
    expect(filter).toContain('xfade=transition=slideleft:duration=0.500000:offset=0')
    expect(filter).toContain('acrossfade=ns=24000')
    expect(valueAfter(args, '-frames:v')).toBe('30')
    expect(valueAfter(args, '-c:v')).toBe('h264_nvenc')
    expect(args.at(-1)).toBe('T1.mkv')
  })

  it('neige TV : coupes sèches, neige et souffle générés sans aucun fondu', () => {
    const args = transitionArgs({
      tail: 'A-tail.mkv',
      head: 'B-head.mkv',
      output: 'T1.mkv',
      kind: 'tvsnow',
      frames: 60,
      fps: 60,
      encoder: 'h264_nvenc',
      draft: false
    })
    const filter = valueAfter(args, '-filter_complex') ?? ''
    // Aucune entrée : tout est généré.
    expect(args).not.toContain('-i')
    expect(filter).toContain('noise=c0s=100')
    expect(filter).toContain('cb=128:cr=128')
    expect(filter).toContain('anoisesrc=')
    expect(filter).toContain('atrim=end_sample=48000')
    expect(filter).not.toMatch(/fade/)
    expect(valueAfter(args, '-frames:v')).toBe('60')
  })
})

describe('assemblage et volume', () => {
  it('liste concat : barres obliques et apostrophes échappées', () => {
    expect(concatListContent(['C:\\Temp\\seg-001.mkv', "C:\\L'été\\seg-002.mkv"])).toBe(
      "file 'C:/Temp/seg-001.mkv'\nfile 'C:/L'\\''été/seg-002.mkv'\n"
    )
  })

  it('mesure loudnorm : audio seul, cible -14 LUFS', () => {
    const args = loudnormMeasureArgs('liste.txt')
    expect(args).toContain('-vn')
    expect(valueAfter(args, '-af')).toBe('loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json')
  })

  it('lit les mesures loudnorm, refuse un silence', () => {
    const stderr = `[Parsed_loudnorm_0 @ 0x1]\n{\n\t"input_i" : "-22.13",\n\t"input_tp" : "-20.70",\n\t"input_lra" : "6.60",\n\t"input_thresh" : "-32.35",\n\t"target_offset" : "0.27"\n}\n`
    expect(parseLoudnorm(stderr)).toMatchObject({ input_i: '-22.13', target_offset: '0.27' })
    expect(parseLoudnorm(stderr.replace('-22.13', '-inf'))).toBeNull()
    expect(parseLoudnorm('rien')).toBeNull()
  })

  it('final : vidéo copiée, 2e passe loudnorm linéaire, AAC, mp4 faststart', () => {
    const args = finalArgs('liste.txt', 'out.part', {
      input_i: '-22.13',
      input_tp: '-20.70',
      input_lra: '6.60',
      input_thresh: '-32.35',
      target_offset: '0.27'
    })
    expect(valueAfter(args, '-c:v')).toBe('copy')
    const af = valueAfter(args, '-af') ?? ''
    expect(af).toContain('measured_I=-22.13')
    expect(af).toContain('linear=true')
    expect(af).toContain('aresample=48000')
    expect(valueAfter(args, '-c:a')).toBe('aac')
    expect(valueAfter(args, '-movflags')).toBe('+faststart')
    expect(args.slice(-3)).toEqual(['-f', 'mp4', 'out.part'])
  })

  it('final sans loudnorm : aucun filtre audio', () => {
    expect(finalArgs('liste.txt', 'out.part', null)).not.toContain('-af')
  })
})

describe('parseProgressLine', () => {
  it('lit la position en microsecondes', () => {
    expect(parseProgressLine('out_time_us=12500000')).toEqual({ outTimeSec: 12.5 })
    expect(parseProgressLine('out_time_ms=1000000')).toEqual({ outTimeSec: 1 })
  })
  it('détecte la fin', () => expect(parseProgressLine('progress=end')).toEqual({ end: true }))
  it('ignore le reste', () => {
    expect(parseProgressLine('out_time_us=N/A')).toEqual({})
    expect(parseProgressLine('frame=12')).toEqual({})
  })
})

it('formatCommand met les chemins avec espaces entre guillemets', () => {
  expect(formatCommand('ffmpeg', ['-i', 'C:\\Mes vidéos\\a.mkv', '-y'])).toBe(
    'ffmpeg -i "C:\\Mes vidéos\\a.mkv" -y'
  )
})
