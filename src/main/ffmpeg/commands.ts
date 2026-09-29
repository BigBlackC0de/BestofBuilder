/**
 * Construction des commandes ffmpeg/ffprobe et lecture de leurs résultats.
 * Module pur (aucun accès disque ni processus) pour être testable unitairement.
 */
import type { ClipInfo, TransitionKind } from '@shared/types'

export type ProbeInfo = Omit<ClipInfo, 'thumbnailUrl'>

export function probeArgs(input: string): string[] {
  return ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', input]
}

/** Instant de la miniature : 1 s, ou le milieu du clip s'il dure moins de 2 s. */
export function thumbnailTime(durationSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 0
  return durationSec >= 2 ? 1 : durationSec / 2
}

export function thumbnailArgs(input: string, output: string, atSec: number): string[] {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-ss',
    atSec.toFixed(3),
    '-i',
    input,
    '-frames:v',
    '1',
    '-vf',
    'scale=320:-2',
    '-q:v',
    '4',
    output
  ]
}

/** Convertit un débit d'images ffprobe (« 60/1 », « 30000/1001 ») en nombre. 0 si inconnu. */
export function parseFrameRate(rate: string | undefined): number {
  if (!rate) return 0
  const [num, den] = rate.split('/').map(Number)
  if (num === undefined || !Number.isFinite(num)) return 0
  if (den === undefined) return num
  if (!Number.isFinite(den) || den === 0) return 0
  return Math.round((num / den) * 100) / 100
}

interface RawStream {
  codec_type?: string
  codec_name?: string
  width?: number
  height?: number
  avg_frame_rate?: string
  r_frame_rate?: string
  duration?: string
  disposition?: { attached_pic?: number }
}

interface RawProbe {
  streams?: RawStream[]
  format?: { duration?: string }
}

/** Extrait les informations utiles de la sortie JSON de ffprobe. Lève une erreur si aucune vidéo. */
export function parseProbe(json: string): ProbeInfo {
  const raw = JSON.parse(json) as RawProbe
  const streams = raw.streams ?? []
  const video = streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic)
  if (!video) throw new Error('Aucune piste vidéo')
  const audio = streams.find((s) => s.codec_type === 'audio')

  const duration = Number(raw.format?.duration ?? video.duration)
  const fps = parseFrameRate(video.avg_frame_rate) || parseFrameRate(video.r_frame_rate)

  return {
    durationSec: Number.isFinite(duration) ? duration : 0,
    width: video.width ?? 0,
    height: video.height ?? 0,
    fps,
    videoCodec: video.codec_name ?? 'inconnu',
    audioCodec: audio?.codec_name ?? null,
    hasAudio: audio !== undefined
  }
}

// ===== Rendu =====

export type VideoEncoder = 'h264_nvenc' | 'libx264'

export const OUTPUT_WIDTH = 1920
export const OUTPUT_HEIGHT = 1080
export const AUDIO_RATE = 48000

/** Encodage d'essai minuscule : réussit seulement si NVENC est réellement utilisable. */
export function nvencTestArgs(): string[] {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=black:s=256x256:r=30:d=0.2',
    '-c:v',
    'h264_nvenc',
    '-f',
    'null',
    '-'
  ]
}

/** Réglages de l'encodeur vidéo. Une image clé toutes les 2 s (recommandation YouTube). */
export function videoEncoderArgs(encoder: VideoEncoder, fps: number, draft: boolean): string[] {
  let codec: string[]
  if (encoder === 'h264_nvenc') {
    codec = draft
      ? ['-c:v', 'h264_nvenc', '-preset', 'p2', '-rc', 'vbr', '-cq', '28', '-b:v', '0']
      : [
          '-c:v',
          'h264_nvenc',
          '-preset',
          'p6',
          '-tune',
          'hq',
          '-rc',
          'vbr',
          '-cq',
          '19',
          '-b:v',
          '0',
          '-maxrate',
          '40M',
          '-bufsize',
          '80M',
          '-spatial-aq',
          '1',
          '-temporal-aq',
          '1',
          '-rc-lookahead',
          '32'
        ]
  } else {
    codec = draft
      ? ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23']
      : ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18']
  }
  return [...codec, '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-g', String(Math.round(fps * 2))]
}

/** Encodage sans perte des débuts et fins de clips, qui ne servent qu'à calculer les transitions. */
export const LOSSLESS_VIDEO_ARGS = [
  '-c:v',
  'libx264',
  '-preset',
  'ultrafast',
  '-qp',
  '0',
  '-pix_fmt',
  'yuv420p'
]

/** Marge du filigrane par rapport aux bords (px). */
export const WATERMARK_MARGIN = 32

export interface Watermark {
  path: string
  widthPx: number
  /** 0 à 1. */
  opacity: number
}

/** Morceau d'un clip normalisé : [fromFrame, toFrame[ en images de sortie. */
export interface NormalizePart {
  output: string
  fromFrame: number
  toFrame: number
  /** Vrai pour les débuts/fins réservés aux transitions. */
  lossless: boolean
}

export interface NormalizeOptions {
  input: string
  hasAudio: boolean
  /** Point d'entrée dans la source (s). */
  startSec: number
  /** Nombre d'images à produire. */
  frames: number
  fps: number
  encoder: VideoEncoder
  draft: boolean
  parts: NormalizePart[]
  watermark?: Watermark | null
}

/** Chaîne de filtres vidéo : 1080p avec bandes noires, pixels carrés, ips fixe, yuv420p. */
export function normalizeVideoFilter(fps: number): string {
  const w = OUTPUT_WIDTH
  const h = OUTPUT_HEIGHT
  return [
    `scale=${w}:${h}:force_original_aspect_ratio=decrease:flags=lanczos`,
    `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black`,
    'setsar=1',
    `fps=${fps}`,
    'format=yuv420p'
  ].join(',')
}

/** Échantillons audio par image (800 à 60 ips, 1600 à 30 ips). */
export function samplesPerFrame(fps: number): number {
  return AUDIO_RATE / fps
}

/**
 * Normalise un clip (1080p, ips fixe, audio PCM stéréo 48 kHz, filigrane éventuel) et le découpe
 * en morceaux : début et fin pour les transitions, corps pour l'assemblage.
 *
 * La vidéo est prolongée (dernière image répétée) et l'audio complété par du silence, puis les
 * deux sont coupés au même nombre exact d'images : image et son restent calés.
 */
export function normalizeArgs(o: NormalizeOptions): string[] {
  // Entrées : 0 = clip, puis filigrane et silence si besoin.
  const watermarkInput = o.watermark ? 1 : -1
  const silenceInput = o.watermark ? 2 : 1
  const spf = samplesPerFrame(o.fps)
  const k = o.parts.length
  const chains: string[] = []

  let video = `[0:v:0]${normalizeVideoFilter(o.fps)},tpad=stop_mode=clone:stop_duration=2`
  if (o.watermark) {
    const opacity = Math.min(1, Math.max(0, o.watermark.opacity)).toFixed(2)
    chains.push(
      `[${watermarkInput}:v]scale=${o.watermark.widthPx}:-1,format=rgba,colorchannelmixer=aa=${opacity}[wm]`
    )
    chains.push(`${video}[base]`)
    const m = WATERMARK_MARGIN
    video = `[base][wm]overlay=W-w-${m}:H-h-${m}:shortest=1,format=yuv420p`
  }
  const vLabels = o.parts.map((_, i) => `[vp${i}]`).join('')
  const aLabels = o.parts.map((_, i) => `[ap${i}]`).join('')
  chains.push(`${video},trim=end_frame=${o.frames}${k > 1 ? `,split=${k}` : ''}${vLabels}`)
  const audioSource = o.hasAudio ? '[0:a:0]' : `[${silenceInput}:a]`
  chains.push(
    `${audioSource}aresample=${AUDIO_RATE},aformat=sample_fmts=s16:channel_layouts=stereo,apad,` +
      `atrim=end_sample=${o.frames * spf}${k > 1 ? `,asplit=${k}` : ''}${aLabels}`
  )
  o.parts.forEach((p, i) => {
    chains.push(
      `[vp${i}]trim=start_frame=${p.fromFrame}:end_frame=${p.toFrame},setpts=PTS-STARTPTS[v${i}]`
    )
    chains.push(
      `[ap${i}]atrim=start_sample=${p.fromFrame * spf}:end_sample=${p.toFrame * spf},asetpts=PTS-STARTPTS[a${i}]`
    )
  })

  return [
    '-hide_banner',
    '-nostdin',
    '-y',
    '-progress',
    'pipe:1',
    '-nostats',
    ...(o.startSec > 0 ? ['-ss', o.startSec.toFixed(3)] : []),
    // On ne lit que ce qui est utile (+1 s de marge).
    '-t',
    (o.frames / o.fps + 1).toFixed(3),
    '-i',
    o.input,
    ...(o.watermark ? ['-loop', '1', '-i', o.watermark.path] : []),
    ...(o.hasAudio
      ? []
      : ['-f', 'lavfi', '-i', `anullsrc=channel_layout=stereo:sample_rate=${AUDIO_RATE}`]),
    '-filter_complex',
    chains.join(';'),
    ...o.parts.flatMap((p, i) => [
      '-map',
      `[v${i}]`,
      '-map',
      `[a${i}]`,
      ...(p.lossless ? LOSSLESS_VIDEO_ARGS : videoEncoderArgs(o.encoder, o.fps, o.draft)),
      '-c:a',
      'pcm_s16le',
      p.output
    ])
  ]
}

export interface TransitionOptions {
  /** Fin de l'élément sortant. */
  tail: string
  /** Début de l'élément entrant. */
  head: string
  output: string
  kind: Exclude<TransitionKind, 'none'>
  frames: number
  fps: number
  encoder: VideoEncoder
  draft: boolean
}

/** Rend une transition (xfade + acrossfade) entre la fin d'un élément et le début du suivant. */
export function transitionArgs(o: TransitionOptions): string[] {
  const duration = (o.frames / o.fps).toFixed(6)
  const samples = o.frames * samplesPerFrame(o.fps)
  const filter =
    `[0:v][1:v]xfade=transition=${o.kind}:duration=${duration}:offset=0,format=yuv420p[v];` +
    `[0:a][1:a]acrossfade=ns=${samples}[a]`
  return [
    '-hide_banner',
    '-nostdin',
    '-y',
    '-progress',
    'pipe:1',
    '-nostats',
    '-i',
    o.tail,
    '-i',
    o.head,
    '-filter_complex',
    filter,
    '-map',
    '[v]',
    '-map',
    '[a]',
    ...videoEncoderArgs(o.encoder, o.fps, o.draft),
    '-frames:v',
    String(o.frames),
    '-c:a',
    'pcm_s16le',
    o.output
  ]
}

/** Contenu du fichier liste du démuxeur concat (chemins en UTF-8, apostrophes échappées). */
export function concatListContent(files: readonly string[]): string {
  const quote = (f: string) => `'${f.replace(/\\/g, '/').replace(/'/g, `'\\''`)}'`
  return files.map((f) => `file ${quote(f)}`).join('\n') + '\n'
}

/** Cible YouTube : -14 LUFS intégrés, crêtes à -1,5 dBTP. */
export const LOUDNORM_TARGET = 'I=-14:TP=-1.5:LRA=11'

const concatInput = (listFile: string) => ['-f', 'concat', '-safe', '0', '-i', listFile]

/** 1re passe de loudnorm : mesure du volume de tout le montage (audio seul, rapide). */
export function loudnormMeasureArgs(listFile: string): string[] {
  return [
    '-hide_banner',
    '-nostdin',
    '-progress',
    'pipe:1',
    '-nostats',
    ...concatInput(listFile),
    '-vn',
    '-af',
    `loudnorm=${LOUDNORM_TARGET}:print_format=json`,
    '-f',
    'null',
    '-'
  ]
}

export interface LoudnormMeasure {
  input_i: string
  input_tp: string
  input_lra: string
  input_thresh: string
  target_offset: string
}

/** Extrait les mesures JSON affichées par loudnorm. null si absentes ou inutilisables (silence). */
export function parseLoudnorm(stderr: string): LoudnormMeasure | null {
  const start = stderr.lastIndexOf('{')
  const end = stderr.lastIndexOf('}')
  if (start < 0 || end < start) return null
  try {
    const data = JSON.parse(stderr.slice(start, end + 1)) as Partial<LoudnormMeasure>
    const keys = ['input_i', 'input_tp', 'input_lra', 'input_thresh', 'target_offset'] as const
    if (!keys.every((key) => Number.isFinite(Number(data[key])))) return null
    return data as LoudnormMeasure
  } catch {
    return null
  }
}

/**
 * Assemblage final : la vidéo est copiée telle quelle (aucune perte, très rapide), l'audio est
 * normalisé (2e passe de loudnorm, linéaire) puis encodé une seule fois en AAC.
 */
export function finalArgs(
  listFile: string,
  output: string,
  loudnorm: LoudnormMeasure | null
): string[] {
  const audioFilter = loudnorm
    ? [
        '-af',
        `loudnorm=${LOUDNORM_TARGET}:measured_I=${loudnorm.input_i}:measured_TP=${loudnorm.input_tp}` +
          `:measured_LRA=${loudnorm.input_lra}:measured_thresh=${loudnorm.input_thresh}` +
          `:offset=${loudnorm.target_offset}:linear=true,aresample=${AUDIO_RATE}`
      ]
    : []
  return [
    '-hide_banner',
    '-nostdin',
    '-y',
    '-progress',
    'pipe:1',
    '-nostats',
    ...concatInput(listFile),
    '-map',
    '0:v',
    '-map',
    '0:a',
    '-c:v',
    'copy',
    ...audioFilter,
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-ar',
    String(AUDIO_RATE),
    '-ac',
    '2',
    '-movflags',
    '+faststart',
    '-f',
    'mp4',
    output
  ]
}

/** Lit une ligne de `-progress` : position atteinte (s) ou fin du traitement. */
export function parseProgressLine(line: string): { outTimeSec?: number; end?: boolean } {
  const eq = line.indexOf('=')
  if (eq < 0) return {}
  const key = line.slice(0, eq).trim()
  const value = line.slice(eq + 1).trim()
  if (key === 'out_time_us' || key === 'out_time_ms') {
    // Malgré son nom, out_time_ms est aussi en microsecondes.
    const us = Number(value)
    return Number.isFinite(us) && us >= 0 ? { outTimeSec: us / 1e6 } : {}
  }
  if (key === 'progress' && value === 'end') return { end: true }
  return {}
}

/** Met une commande en forme lisible pour le journal (arguments avec espaces entre guillemets). */
export function formatCommand(bin: string, args: readonly string[]): string {
  return [bin, ...args].map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)).join(' ')
}
