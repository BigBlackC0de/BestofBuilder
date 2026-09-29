import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { app, powerSaveBlocker } from 'electron'
import { sanitizeFileName } from '@shared/naming'
import {
  PRESETS,
  type RenderFailure,
  type RenderJob,
  type RenderOutcome,
  type RenderProgress
} from '@shared/types'
import { probeAsset } from '../assets'
import { AppError, toUserError } from '../errors'
import {
  concatListContent,
  finalArgs,
  formatCommand,
  loudnormMeasureArgs,
  normalizeArgs,
  OUTPUT_WIDTH,
  parseLoudnorm,
  transitionArgs,
  type NormalizePart,
  type ProbeInfo,
  type Watermark
} from '../ffmpeg/commands'
import { detectEncoder } from '../ffmpeg/encoder'
import { ffmpegPath } from '../ffmpeg/paths'
import { runFfmpeg } from '../ffmpeg/run'
import { analyzeClip } from '../library/analyze'
import { previewDir } from '../library/preview'
import { getClip } from '../library/registry'
import { getSettings } from '../settings'
import { RenderLog } from './log'
import {
  buildPlan,
  chapterWarning,
  formatChapters,
  planChapters,
  type PlanInput
} from '@shared/plan'

export type RenderResult = { ok: true; data: RenderOutcome } | { ok: false; error: RenderFailure }

/** Poids des étapes finales dans la barre de progression, relatifs à la durée de la vidéo. */
const MEASURE_WEIGHT = 0.03
const FINAL_WEIGHT = 0.06
/** Une transition coûte plus cher par seconde qu'une normalisation (deux décodages sans perte). */
const TRANSITION_WEIGHT = 2
/** Durée minimale gardée d'un clip après découpe (s). */
const MIN_CLIP_SEC = 0.5
/** Les aperçus des .mkv sont gardés une semaine. */
const PREVIEW_MAX_AGE_MS = 7 * 24 * 3600 * 1000

class RenderCancelled extends Error {
  constructor() {
    super('Rendu annulé')
  }
}

let active: { controller: AbortController; done: Promise<RenderResult> } | null = null
let lastOutputPath: string | null = null
let lastLogPath: string | null = null
let lastChapters: string | null = null

export const isRendering = (): boolean => active !== null
export const getLastOutputPath = (): string | null => lastOutputPath
export const getLastLogPath = (): string | null => lastLogPath
export const getLastChapters = (): string | null => lastChapters

function renderTempRoot(): string {
  return join(app.getPath('temp'), 'BestofBuilder')
}

export function defaultOutputFolder(): string {
  return getSettings().outputFolder ?? app.getPath('videos')
}

/**
 * Au démarrage : supprime les dossiers laissés par un rendu interrompu brutalement (plantage)
 * et les aperçus de plus d'une semaine.
 */
export async function cleanupStaleRenders(): Promise<void> {
  const root = renderTempRoot()
  const entries = await readdir(root).catch(() => [])
  await Promise.all(
    entries
      .filter((name) => name.startsWith('render-'))
      .map((name) => rm(join(root, name), { recursive: true, force: true }).catch(() => {}))
  )
  const previews = await readdir(previewDir()).catch(() => [])
  for (const name of previews) {
    const path = join(previewDir(), name)
    const info = await stat(path).catch(() => null)
    if (info && Date.now() - info.mtimeMs > PREVIEW_MAX_AGE_MS) await rm(path, { force: true })
  }
}

/** « Best-of.mp4 » existe déjà → « Best-of (2).mp4 ». On n'écrase jamais un fichier. */
function uniquePath(path: string): string {
  if (!existsSync(path) && !existsSync(`${path}.part`)) return path
  const ext = extname(path)
  const stem = path.slice(0, -ext.length)
  for (let n = 2; ; n++) {
    const candidate = `${stem} (${n})${ext}`
    if (!existsSync(candidate) && !existsSync(`${candidate}.part`)) return candidate
  }
}

export async function cancelRender(): Promise<void> {
  if (!active) return
  active.controller.abort(new RenderCancelled())
  await active.done
}

export async function startRender(
  job: RenderJob,
  onProgress: (p: RenderProgress) => void
): Promise<RenderResult> {
  if (active) {
    return {
      ok: false,
      error: {
        message: 'Un rendu est déjà en cours.',
        action: 'Attends qu’il se termine ou annule-le.',
        cancelled: false,
        logPath: null
      }
    }
  }
  const controller = new AbortController()
  const done = render(job, controller.signal, onProgress)
  active = { controller, done }
  try {
    return await done
  } finally {
    active = null
  }
}

/** Élément du montage (intro, clip ou outro) avec sa source. */
interface SourceItem extends PlanInput {
  path: string
  hasAudio: boolean
  /** Le filigrane s'applique aux clips, pas à l'intro ni à l'outro. */
  watermark: boolean
}

const ASSET_LABEL = { intro: 'L’intro', outro: 'L’outro' } as const

async function assetSource(kind: 'intro' | 'outro', path: string): Promise<SourceItem> {
  const probe: ProbeInfo | null = existsSync(path) ? await probeAsset(path) : null
  if (!probe) {
    throw new AppError({
      message: `${ASSET_LABEL[kind]} « ${basename(path)} » est introuvable ou illisible.`,
      action: 'Choisis un autre fichier dans les Réglages, ou retire-la.'
    })
  }
  return {
    kind,
    title: kind === 'intro' ? 'Intro' : 'Outro',
    startSec: 0,
    durationSec: probe.durationSec,
    path,
    hasAudio: probe.hasAudio,
    watermark: false
  }
}

async function clipSource(item: RenderJob['items'][number]): Promise<SourceItem> {
  const record = getClip(item.clipId)
  if (!record) {
    throw new AppError({
      message: 'Un des clips sélectionnés ne fait plus partie de la liste.',
      action: 'Clique sur « Actualiser » puis relance le rendu.'
    })
  }
  if (!record.probe) await analyzeClip(item.clipId)
  const probe = record.probe
  if (!probe) throw new Error(`Clip non analysé : ${record.path}`)

  const duration = probe.durationSec
  const inSec = Math.min(Math.max(0, item.inSec), Math.max(0, duration - MIN_CLIP_SEC))
  const end = Math.min(item.outSec ?? duration, duration)
  const outSec = end - inSec >= MIN_CLIP_SEC ? end : Math.min(duration, inSec + MIN_CLIP_SEC)
  return {
    kind: 'clip',
    title: item.title.trim() || basename(record.path, extname(record.path)),
    startSec: inSec,
    durationSec: outSec - inSec,
    path: record.path,
    hasAudio: probe.hasAudio,
    watermark: true
  }
}

async function render(
  job: RenderJob,
  signal: AbortSignal,
  onProgress: (p: RenderProgress) => void
): Promise<RenderResult> {
  const started = Date.now()
  const log = await RenderLog.create()
  lastLogPath = log.path
  lastChapters = null
  await mkdir(renderTempRoot(), { recursive: true })
  const tempDir = await mkdtemp(join(renderTempRoot(), 'render-'))
  const blocker = powerSaveBlocker.start('prevent-app-suspension')
  let partPath: string | null = null

  try {
    const settings = getSettings()
    const preset = PRESETS.find((p) => p.id === job.presetId)
    if (!preset) throw new Error(`Préréglage inconnu : ${job.presetId}`)
    if (job.items.length === 0) {
      throw new AppError({
        message: 'Aucun clip sélectionné.',
        action: 'Coche au moins un clip dans la liste.'
      })
    }

    // Sources : intro, clips dans l'ordre choisi, outro.
    const sources: SourceItem[] = []
    if (settings.introPath) sources.push(await assetSource('intro', settings.introPath))
    for (const item of job.items) sources.push(await clipSource(item))
    if (settings.outroPath) sources.push(await assetSource('outro', settings.outroPath))

    let watermark: Watermark | null = null
    if (settings.watermarkPath) {
      if (!existsSync(settings.watermarkPath)) {
        throw new AppError({
          message: `Le filigrane « ${basename(settings.watermarkPath)} » est introuvable.`,
          action: 'Choisis une autre image dans les Réglages, ou retire le filigrane.'
        })
      }
      watermark = {
        path: settings.watermarkPath,
        widthPx: 2 * Math.round((OUTPUT_WIDTH * settings.watermarkSize) / 2),
        opacity: settings.watermarkOpacity
      }
    }

    const fps = preset.fps
    const plan = buildPlan(sources, fps, settings.transition, settings.transitionDuration)
    const totalSec = plan.totalFrames / fps
    const encoder = await detectEncoder()
    const bin = ffmpegPath()
    const outputDir = defaultOutputFolder()
    await mkdir(outputDir, { recursive: true })
    const outputPath = uniquePath(join(outputDir, sanitizeFileName(job.fileName)))
    partPath = `${outputPath}.part`

    log.line(`BestofBuilder ${app.getVersion()} — rendu du ${new Date().toLocaleString('fr-FR')}`)
    log.line(`Préréglage : ${preset.label} (${fps} ips) — encodeur : ${encoder}`)
    log.line(
      `Transition : ${settings.transition} (${settings.transitionDuration} s) — volume : ${settings.loudnorm ? '-14 LUFS' : 'inchangé'}`
    )
    log.line(
      `Filigrane : ${watermark ? `${watermark.path} (${watermark.widthPx} px, opacité ${watermark.opacity})` : 'aucun'}`
    )
    log.line(`Sortie : ${outputPath}`)
    log.line(`Dossier temporaire : ${tempDir}`)
    log.line(`Éléments (${plan.items.length}, durée finale ${totalSec.toFixed(2)} s) :`)
    plan.items.forEach((item, i) => {
      const src = sources[i]
      log.line(
        `  ${i + 1}. [${item.kind}] ${src?.path} — de ${item.startSec.toFixed(2)} s, ${item.frames} images` +
          ` (début ${item.headFrames}, fin ${item.tailFrames}), titre « ${item.title} »`
      )
    })

    // Progression pondérée par la durée traitée à chaque étape.
    const normalizeWeight = plan.items.reduce((sum, i) => sum + i.frames / fps, 0)
    const transitionWeight = (plan.overlaps.reduce((a, b) => a + b, 0) / fps) * TRANSITION_WEIGHT
    const totalWeight =
      normalizeWeight +
      transitionWeight +
      (settings.loudnorm ? totalSec * MEASURE_WEIGHT : 0) +
      totalSec * FINAL_WEIGHT
    let doneWeight = 0

    const report = (weight: number, step: string) => {
      const ratio = Math.min(1, weight / totalWeight)
      const elapsed = (Date.now() - started) / 1000
      const etaSec = ratio > 0.01 && elapsed > 3 ? (elapsed / ratio) * (1 - ratio) : null
      onProgress({ ratio, step, etaSec })
    }
    /** Lance une étape : `span` est la durée (s) traitée, `weight` son poids dans la barre. */
    const run = async (args: string[], step: string, span: number, weight = span) => {
      log.section(step)
      log.line(formatCommand(bin, args))
      log.line()
      report(doneWeight, step)
      const base = doneWeight
      const result = await runFfmpeg(bin, args, {
        signal,
        onStderr: (text) => log.raw(text),
        onProgress: (sec) => report(base + (Math.min(sec, span) / span) * weight, step)
      })
      log.line(`→ code de sortie ${result.code}`)
      doneWeight = base + weight
      return result
    }

    // Étape 1 : préparation élément par élément (mémoire maîtrisée, même pour 25 clips).
    const clipCount = plan.items.filter((i) => i.kind === 'clip').length
    let clipNumber = 0
    const pieces: { head?: string; body: string; tail?: string }[] = []
    for (const [i, item] of plan.items.entries()) {
      const src = sources[i]
      if (!src) throw new Error('Source manquante')
      const prefix = join(tempDir, String(i + 1).padStart(3, '0'))
      const piece: { head?: string; body: string; tail?: string } = { body: `${prefix}-corps.mkv` }
      const parts: NormalizePart[] = []
      if (item.headFrames > 0) {
        piece.head = `${prefix}-debut.mkv`
        parts.push({ output: piece.head, fromFrame: 0, toFrame: item.headFrames, lossless: true })
      }
      parts.push({
        output: piece.body,
        fromFrame: item.headFrames,
        toFrame: item.frames - item.tailFrames,
        lossless: false
      })
      if (item.tailFrames > 0) {
        piece.tail = `${prefix}-fin.mkv`
        parts.push({
          output: piece.tail,
          fromFrame: item.frames - item.tailFrames,
          toFrame: item.frames,
          lossless: true
        })
      }

      const label =
        item.kind === 'clip'
          ? `Préparation du clip ${++clipNumber}/${clipCount}`
          : `Préparation de l’${item.kind}`
      const args = normalizeArgs({
        input: src.path,
        hasAudio: src.hasAudio,
        startSec: item.startSec,
        frames: item.frames,
        fps,
        encoder,
        draft: preset.draft,
        parts,
        watermark: src.watermark ? watermark : null
      })
      const { code } = await run(args, label, item.frames / fps)
      if (code !== 0) {
        throw new AppError({
          message:
            item.kind === 'clip'
              ? `La préparation du clip « ${basename(src.path)} » a échoué.`
              : `La préparation de l’${item.kind} a échoué.`,
          action: 'Clique sur « Voir le journal » pour le détail, ou retire cet élément et relance.'
        })
      }
      pieces.push(piece)
    }

    // Étape 2 : transitions, rendues uniquement sur les quelques images qui se chevauchent.
    const sequence: string[] = []
    const transitionCount = plan.overlaps.filter((d) => d > 0).length
    let transitionNumber = 0
    for (const [i, piece] of pieces.entries()) {
      sequence.push(piece.body)
      const frames = plan.overlaps[i] ?? 0
      const next = pieces[i + 1]
      if (frames === 0 || !next || settings.transition === 'none') continue
      if (!piece.tail || !next.head) throw new Error('Morceaux de transition manquants')
      const output = join(tempDir, `${String(i + 1).padStart(3, '0')}-transition.mkv`)
      const args = transitionArgs({
        tail: piece.tail,
        head: next.head,
        output,
        kind: settings.transition,
        frames,
        fps,
        encoder,
        draft: preset.draft
      })
      const span = frames / fps
      const { code } = await run(
        args,
        `Transition ${++transitionNumber}/${transitionCount}`,
        span,
        span * TRANSITION_WEIGHT
      )
      if (code !== 0) {
        throw new AppError({
          message: 'Une transition entre deux clips a échoué.',
          action:
            'Clique sur « Voir le journal », ou choisis une autre transition dans les Réglages.'
        })
      }
      sequence.push(output)
    }

    const listFile = join(tempDir, 'liste.txt')
    await writeFile(listFile, concatListContent(sequence), 'utf8')
    log.section('Liste d’assemblage')
    log.raw(concatListContent(sequence))

    // Étape 3 : mesure du volume (1re passe loudnorm).
    let measure = null
    if (settings.loudnorm) {
      const result = await run(
        loudnormMeasureArgs(listFile),
        'Mesure du volume',
        totalSec,
        totalSec * MEASURE_WEIGHT
      )
      measure = result.code === 0 ? parseLoudnorm(result.stderrTail) : null
      if (!measure) log.line('Mesure du volume impossible (silence ?) : volume laissé tel quel.')
    }

    // Étape 4 : assemblage final (image copiée, son normalisé puis encodé en AAC).
    const { code } = await run(
      finalArgs(listFile, partPath, measure),
      'Assemblage final',
      totalSec,
      totalSec * FINAL_WEIGHT
    )
    if (code !== 0) {
      throw new AppError({
        message: 'L’assemblage final a échoué.',
        action: 'Clique sur « Voir le journal » pour le détail.'
      })
    }

    await rename(partPath, outputPath)
    partPath = null
    lastOutputPath = outputPath

    const chapterList = planChapters(plan)
    const chapters = formatChapters(chapterList, totalSec)
    lastChapters = chapters
    const elapsedSec = (Date.now() - started) / 1000
    log.section('Chapitres YouTube')
    log.line(chapters)
    log.section(`Terminé en ${elapsedSec.toFixed(1)} s`)
    onProgress({ ratio: 1, step: 'Terminé', etaSec: 0 })
    return {
      ok: true,
      data: {
        outputPath,
        durationSec: totalSec,
        elapsedSec,
        logPath: log.path,
        chapters,
        chapterWarning: chapterWarning(chapterList, totalSec)
      }
    }
  } catch (err) {
    const cancelled = signal.aborted
    log.section(cancelled ? 'Annulé par l’utilisateur' : 'Échec')
    if (!cancelled) log.line(err instanceof Error ? (err.stack ?? err.message) : String(err))
    const error = cancelled ? { message: 'Rendu annulé.' } : toUserError(err)
    return { ok: false, error: { ...error, cancelled, logPath: log.path } }
  } finally {
    powerSaveBlocker.stop(blocker)
    if (partPath) await rm(partPath, { force: true, maxRetries: 5, retryDelay: 200 })
    await rm(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    await log.close()
  }
}
