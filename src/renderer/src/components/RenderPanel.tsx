import { useEffect, useState } from 'react'
import type { RenderResult } from '@shared/ipc'
import { formatDuration, formatSpan } from '@shared/format'
import { defaultOutputName } from '@shared/naming'
import { buildPlan, type PlanInput } from '@shared/plan'
import {
  PRESETS,
  TRANSITIONS,
  type AppInfo,
  type PresetId,
  type RenderProgress,
  type SettingsView
} from '@shared/types'
import { keptDuration, type ClipState } from './ClipRow'
import { Panel } from './Panel'

type Phase =
  | { kind: 'idle' }
  | { kind: 'running'; progress: RenderProgress }
  | { kind: 'finished'; result: RenderResult }

interface RenderPanelProps {
  /** Clips cochés, dans l'ordre du montage. */
  selected: ClipState[]
  /** Vrai tant que des clips cochés sont encore en cours d'analyse. */
  analyzing: boolean
  appInfo: AppInfo | null
  settings: SettingsView | null
  onSettings: (settings: SettingsView) => void
  onOpenSettings: () => void
  onRunningChange: (running: boolean) => void
}

/** Durée finale exacte, avec intro, outro et chevauchement des transitions. */
function estimate(selected: ClipState[], settings: SettingsView | null): number {
  if (!settings || selected.length === 0) return 0
  const fps = PRESETS.find((p) => p.id === settings.presetId)?.fps ?? 60
  const inputs: PlanInput[] = []
  const asset = (kind: 'intro' | 'outro') => {
    const d = settings.assets[kind]?.durationSec
    if (d) inputs.push({ kind, title: kind, startSec: 0, durationSec: d })
  }
  asset('intro')
  for (const c of selected) {
    inputs.push({ kind: 'clip', title: '', startSec: 0, durationSec: keptDuration(c) })
  }
  asset('outro')
  const plan = buildPlan(inputs, fps, settings.transition, settings.transitionDuration)
  return plan.totalFrames / fps
}

export function RenderPanel({
  selected,
  analyzing,
  appInfo,
  settings,
  onSettings,
  onOpenSettings,
  onRunningChange
}: RenderPanelProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  // null : on suit le nom par défaut (semaine des clips) tant que l'utilisateur ne l'a pas modifié.
  const [customName, setCustomName] = useState<string | null>(null)

  useEffect(
    () =>
      window.bob.render.onProgress((progress) =>
        setPhase((prev) => (prev.kind === 'running' ? { kind: 'running', progress } : prev))
      ),
    []
  )

  const totalSec = estimate(selected, settings)
  const latest = selected.reduce((max, c) => Math.max(max, c.entry.createdAt), 0)
  const defaultName = defaultOutputName(latest ? new Date(latest) : new Date())
  const fileName = customName ?? defaultName
  const running = phase.kind === 'running'
  const assetProblem = settings
    ? (Object.values(settings.assets).find((a) => a?.problem) ?? null)
    : null
  const canStart =
    !running &&
    !!settings &&
    selected.length > 0 &&
    !analyzing &&
    !assetProblem &&
    fileName.trim() !== ''

  const start = async () => {
    if (!settings) return
    setPhase({ kind: 'running', progress: { ratio: 0, step: 'Préparation', etaSec: null } })
    onRunningChange(true)
    try {
      const result = await window.bob.render.start({
        items: selected.map((c) => ({ clipId: c.entry.id, ...c.edit })),
        presetId: settings.presetId,
        fileName
      })
      setPhase(
        result.ok || !result.error.cancelled ? { kind: 'finished', result } : { kind: 'idle' }
      )
    } finally {
      onRunningChange(false)
    }
  }

  const setPreset = (presetId: PresetId) =>
    void window.bob.settings.setPreset(presetId).then(onSettings)

  return (
    <Panel
      title="RENDU.EXE"
      className="panel--render"
      status={
        <span className={`mono ${running ? 'blink' : ''}`}>
          {running ? 'EN COURS' : phase.kind === 'finished' ? 'TERMINÉ' : 'PRÊT'}
        </span>
      }
    >
      <div className="render">
        <div>
          <p className="field__label mono">DURÉE FINALE</p>
          <p className="render__total mono">{formatDuration(totalSec)}</p>
          <p className="render__sub mono">
            {selected.length} CLIP{selected.length > 1 ? 'S' : ''} SÉLECTIONNÉ
            {selected.length > 1 ? 'S' : ''}
          </p>
        </div>

        {phase.kind === 'running' ? (
          <RunningView progress={phase.progress} />
        ) : phase.kind === 'finished' ? (
          <FinishedView result={phase.result} onBack={() => setPhase({ kind: 'idle' })} />
        ) : (
          <>
            <label className="field">
              <span className="field__label mono">PRÉRÉGLAGE</span>
              <select
                className="input"
                value={settings?.presetId ?? ''}
                onChange={(e) => setPreset(e.target.value as PresetId)}
              >
                {PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>

            {settings && <Dressing settings={settings} onOpen={onOpenSettings} />}

            <label className="field">
              <span className="field__label mono">NOM DU FICHIER</span>
              <input
                className="input"
                value={fileName}
                onChange={(e) => setCustomName(e.target.value)}
                spellCheck={false}
              />
              {customName !== null && customName !== defaultName && (
                <button className="link" onClick={() => setCustomName(null)}>
                  Revenir au nom par défaut
                </button>
              )}
            </label>

            <div className="field">
              <span className="field__label mono">DOSSIER DE SORTIE</span>
              <div className="field__row">
                <span className="field__path mono" title={settings?.outputFolder}>
                  {settings?.outputFolder ?? '…'}
                </span>
                <button
                  className="btn btn--small"
                  onClick={() => void window.bob.settings.pickOutputFolder().then(onSettings)}
                >
                  Changer
                </button>
              </div>
            </div>

            <p className="render__encoder mono">
              ENCODEUR :{' '}
              {appInfo?.encoder === 'h264_nvenc' ? (
                <span className="ok">NVENC (CARTE GRAPHIQUE)</span>
              ) : appInfo?.encoder === 'libx264' ? (
                <span className="warn">x264 (PROCESSEUR, PLUS LENT)</span>
              ) : (
                '…'
              )}
            </p>

            <button
              className="btn btn--primary btn--big"
              disabled={!canStart}
              onClick={() => void start()}
            >
              Générer
            </button>
            {assetProblem && (
              <p className="render__hint warn">
                « {assetProblem.fileName} » : {assetProblem.problem}. Corrige-le dans les Réglages.
              </p>
            )}
            {analyzing && <p className="render__hint">Analyse des clips en cours…</p>}
            {!analyzing && selected.length === 0 && (
              <p className="render__hint">Coche au moins un clip à gauche.</p>
            )}
          </>
        )}
      </div>
    </Panel>
  )
}

/** Résumé de l'habillage, avec accès aux réglages. */
function Dressing({ settings, onOpen }: { settings: SettingsView; onOpen: () => void }) {
  const transition = TRANSITIONS.find((t) => t.id === settings.transition)
  const name = (kind: 'intro' | 'outro' | 'watermark') => {
    const a = settings.assets[kind]
    return a ? <span className={a.problem ? 'warn' : ''}>{a.fileName}</span> : '—'
  }
  return (
    <div className="field">
      <span className="field__label mono">HABILLAGE</span>
      <dl className="dressing">
        <dt>Transition</dt>
        <dd>
          {transition?.label}
          {settings.transition !== 'none' &&
            ` · ${settings.transitionDuration.toFixed(1).replace('.', ',')} s`}
        </dd>
        <dt>Intro</dt>
        <dd>{name('intro')}</dd>
        <dt>Outro</dt>
        <dd>{name('outro')}</dd>
        <dt>Filigrane</dt>
        <dd>{name('watermark')}</dd>
        <dt>Volume</dt>
        <dd>{settings.loudnorm ? '-14 LUFS' : 'inchangé'}</dd>
      </dl>
      <button className="link" onClick={onOpen}>
        Modifier l’habillage
      </button>
    </div>
  )
}

function RunningView({ progress }: { progress: RenderProgress }) {
  const percent = Math.floor(progress.ratio * 100)
  return (
    <div className="progress">
      <p className="progress__percent mono">{percent} %</p>
      <div
        className="progress__bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className="progress__fill" style={{ width: `${progress.ratio * 100}%` }} />
      </div>
      <p className="progress__step mono">{progress.step.toUpperCase()}</p>
      <p className="progress__eta mono">
        {progress.etaSec === null
          ? 'Estimation du temps restant…'
          : `≈ ${formatSpan(progress.etaSec)} restantes`}
      </p>
      <button className="btn" onClick={() => void window.bob.render.cancel()}>
        Annuler
      </button>
    </div>
  )
}

function FinishedView({ result, onBack }: { result: RenderResult; onBack: () => void }) {
  const [copied, setCopied] = useState(false)

  if (result.ok) {
    const { outputPath, durationSec, elapsedSec, chapters, chapterWarning } = result.data
    const copy = () =>
      void window.bob.render.copyChapters().then((ok) => {
        setCopied(ok)
        if (ok) setTimeout(() => setCopied(false), 2000)
      })
    return (
      <div className="done">
        <p className="done__title mono">RENDU TERMINÉ</p>
        <p className="done__file" title={outputPath}>
          {outputPath.split(/[\\/]/).pop()}
        </p>
        <p className="render__sub mono">
          VIDÉO {formatDuration(durationSec)} · RENDUE EN {formatSpan(elapsedSec).toUpperCase()}
        </p>
        <button className="btn btn--primary" onClick={() => void window.bob.render.showOutput()}>
          Ouvrir le dossier
        </button>

        <div className="field">
          <span className="field__label mono">CHAPITRES YOUTUBE</span>
          <pre className="chapters mono">{chapters}</pre>
          {chapterWarning && <p className="render__hint warn">{chapterWarning}</p>}
          <button className="btn" onClick={copy}>
            {copied ? 'Copié ✓' : 'Copier les chapitres'}
          </button>
        </div>

        <button className="btn" onClick={() => void window.bob.render.openLog()}>
          Voir le journal
        </button>
        <button className="link" onClick={onBack}>
          Nouveau rendu
        </button>
      </div>
    )
  }
  return (
    <div className="done done--error">
      <p className="done__title mono">ÉCHEC DU RENDU</p>
      <p>{result.error.message}</p>
      {result.error.action && <p className="render__hint">{result.error.action}</p>}
      {result.error.logPath && (
        <button className="btn" onClick={() => void window.bob.render.openLog()}>
          Voir le journal
        </button>
      )}
      <button className="link" onClick={onBack}>
        Retour
      </button>
    </div>
  )
}
