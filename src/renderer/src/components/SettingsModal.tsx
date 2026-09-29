import { useEffect, useRef, useState } from 'react'
import { formatDuration } from '@shared/format'
import {
  TRANSITION_MAX,
  TRANSITION_MIN,
  TRANSITIONS,
  WATERMARK_SIZE_MAX,
  WATERMARK_SIZE_MIN,
  type AssetKind,
  type EditableSettings,
  type SettingsView,
  type TransitionKind
} from '@shared/types'
import { Modal } from './Modal'

interface SettingsModalProps {
  settings: SettingsView
  onChange: (settings: SettingsView) => void
  onClose: () => void
}

const percent = (v: number) => `${Math.round(v * 100)} %`
const seconds = (v: number) => `${v.toFixed(1).replace('.', ',')} s`

/** REGLAGES.EXE : transitions, intro/outro, filigrane, volume. */
export function SettingsModal({ settings, onChange, onClose }: SettingsModalProps) {
  // Valeurs locales pour que les curseurs restent fluides ; enregistrées avec un léger délai.
  const [draft, setDraft] = useState<EditableSettings>(settings)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )

  const edit = (patch: Partial<EditableSettings>, delay = 0) => {
    const next = { ...draft, ...patch }
    setDraft(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void window.bob.settings.update(next).then(onChange), delay)
  }

  const pick = (kind: AssetKind) => void window.bob.settings.pickAsset(kind).then(onChange)
  const clear = (kind: AssetKind) => void window.bob.settings.clearAsset(kind).then(onChange)
  const wm = settings.assets.watermark

  return (
    <Modal title="REGLAGES.EXE" onClose={onClose} wide>
      <div className="settings">
        <section className="settings__section">
          <h2 className="settings__title mono">TRANSITIONS</h2>
          <label className="field">
            <span className="field__label mono">TYPE</span>
            <select
              className="input"
              value={draft.transition}
              onChange={(e) => edit({ transition: e.target.value as TransitionKind })}
            >
              {TRANSITIONS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label mono">
              DURÉE <span className="ok">{seconds(draft.transitionDuration)}</span>
            </span>
            <input
              type="range"
              className="range"
              min={TRANSITION_MIN}
              max={TRANSITION_MAX}
              step={0.1}
              value={draft.transitionDuration}
              disabled={draft.transition === 'none'}
              onChange={(e) => edit({ transitionDuration: Number(e.target.value) }, 250)}
            />
          </label>
        </section>

        <section className="settings__section">
          <h2 className="settings__title mono">INTRO ET OUTRO</h2>
          <AssetRow
            label="INTRO"
            info={settings.assets.intro}
            empty="Aucune intro"
            onPick={() => pick('intro')}
            onClear={() => clear('intro')}
          />
          <AssetRow
            label="OUTRO"
            info={settings.assets.outro}
            empty="Aucune outro"
            onPick={() => pick('outro')}
            onClear={() => clear('outro')}
          />
          <p className="render__hint">
            Elles sont préparées comme les clips (1080p, son normalisé) et reliées par la même
            transition. Pas de filigrane dessus.
          </p>
        </section>

        <section className="settings__section">
          <h2 className="settings__title mono">FILIGRANE</h2>
          <AssetRow
            label="IMAGE PNG"
            info={wm}
            empty="Aucun filigrane"
            onPick={() => pick('watermark')}
            onClear={() => clear('watermark')}
          />
          {wm && !wm.problem && (
            <div className="wm">
              <div className="wm__controls">
                <label className="field">
                  <span className="field__label mono">
                    TAILLE <span className="ok">{percent(draft.watermarkSize)}</span> DE LA LARGEUR
                  </span>
                  <input
                    type="range"
                    className="range"
                    min={WATERMARK_SIZE_MIN}
                    max={WATERMARK_SIZE_MAX}
                    step={0.01}
                    value={draft.watermarkSize}
                    onChange={(e) => edit({ watermarkSize: Number(e.target.value) }, 250)}
                  />
                </label>
                <label className="field">
                  <span className="field__label mono">
                    OPACITÉ <span className="ok">{percent(draft.watermarkOpacity)}</span>
                  </span>
                  <input
                    type="range"
                    className="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={draft.watermarkOpacity}
                    onChange={(e) => edit({ watermarkOpacity: Number(e.target.value) }, 250)}
                  />
                </label>
              </div>
              <div className="wm__preview" aria-label="Aperçu de la position du filigrane">
                {wm.previewUrl && (
                  <img
                    src={wm.previewUrl}
                    alt=""
                    style={{
                      width: `${draft.watermarkSize * 100}%`,
                      opacity: draft.watermarkOpacity
                    }}
                  />
                )}
              </div>
            </div>
          )}
        </section>

        <section className="settings__section">
          <h2 className="settings__title mono">VOLUME</h2>
          <label className="check">
            <input
              type="checkbox"
              checked={draft.loudnorm}
              onChange={(e) => edit({ loudnorm: e.target.checked })}
            />
            <span>
              Normaliser le volume à <strong>-14 LUFS</strong> (standard YouTube, recommandé)
            </span>
          </label>
        </section>
      </div>
    </Modal>
  )
}

interface AssetRowProps {
  label: string
  info: SettingsView['assets']['intro']
  empty: string
  onPick: () => void
  onClear: () => void
}

function AssetRow({ label, info, empty, onPick, onClear }: AssetRowProps) {
  return (
    <div className="field">
      <span className="field__label mono">{label}</span>
      <div className="field__row">
        <span className={`asset ${info?.problem ? 'warn' : info ? '' : 'asset--empty'}`}>
          {info ? (
            <>
              {info.fileName}
              {info.durationSec !== null && (
                <span className="mono render__sub"> · {formatDuration(info.durationSec)}</span>
              )}
              {info.problem && <span> · {info.problem}</span>}
            </>
          ) : (
            empty
          )}
        </span>
        <button className="btn btn--small" onClick={onPick}>
          {info ? 'Changer' : 'Choisir'}
        </button>
        {info && (
          <button className="btn btn--small" onClick={onClear}>
            Retirer
          </button>
        )}
      </div>
    </div>
  )
}
