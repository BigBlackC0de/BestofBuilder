import { useCallback, useEffect, useRef, useState } from 'react'
import { formatPrecise } from '@shared/format'
import type { ClipEdit, UserError } from '@shared/types'
import type { ClipState } from './ClipRow'
import { Modal } from './Modal'

/** Durée minimale gardée (doit correspondre au rendu). */
const MIN_KEEP = 0.5
const STEP = 0.1

interface TrimModalProps {
  clip: ClipState
  onSave: (edit: ClipEdit) => void
  onClose: () => void
}

/** DECOUPE.EXE : points d'entrée et de sortie avec aperçu, et titre du clip. */
export function TrimModal({ clip, onSave, onClose }: TrimModalProps) {
  const duration = clip.info?.durationSec ?? 0
  const [url, setUrl] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<UserError | null>(null)
  const [inSec, setInSec] = useState(clip.edit.inSec)
  const [outSec, setOutSec] = useState(clip.edit.outSec ?? duration)
  const [title, setTitle] = useState(clip.edit.title)
  const [current, setCurrent] = useState(clip.edit.inSec)
  const [playingSelection, setPlayingSelection] = useState(false)
  const video = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    let alive = true
    void window.bob.library.preparePreview(clip.entry.id).then((res) => {
      if (!alive) return
      if (res.ok) setUrl(res.data)
      else setPreviewError(res.error)
    })
    return () => {
      alive = false
    }
  }, [clip.entry.id])

  const seek = useCallback(
    (t: number) => {
      const v = video.current
      const clamped = Math.min(Math.max(0, t), duration)
      if (v) v.currentTime = clamped
      setCurrent(clamped)
    },
    [duration]
  )

  const markIn = useCallback(
    (t: number) => setInSec(Math.min(Math.max(0, t), outSec - MIN_KEEP)),
    [outSec]
  )
  const markOut = useCallback(
    (t: number) => setOutSec(Math.max(Math.min(duration, t), inSec + MIN_KEEP)),
    [duration, inSec]
  )

  const playSelection = () => {
    const v = video.current
    if (!v) return
    v.currentTime = inSec
    setPlayingSelection(true)
    void v.play()
  }

  // Raccourcis : I = entrée, O = sortie, Espace = lecture/pause (hors champ texte).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      const v = video.current
      if (e.key === 'i' || e.key === 'I') markIn(v?.currentTime ?? current)
      else if (e.key === 'o' || e.key === 'O') markOut(v?.currentTime ?? current)
      else if (e.key === ' ' && v && e.target === document.body) {
        e.preventDefault()
        if (v.paused) void v.play()
        else v.pause()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [markIn, markOut, current])

  const onTimeUpdate = () => {
    const v = video.current
    if (!v) return
    setCurrent(v.currentTime)
    if (playingSelection && v.currentTime >= outSec) {
      v.pause()
      setPlayingSelection(false)
    }
  }

  const pct = (t: number) => (duration > 0 ? `${(t / duration) * 100}%` : '0%')
  const kept = outSec - inSec
  const trimmed = inSec > 0.005 || outSec < duration - 0.005

  const save = () => {
    onSave({
      inSec: Math.round(inSec * 1000) / 1000,
      outSec: outSec >= duration - 0.005 ? null : Math.round(outSec * 1000) / 1000,
      title: title.trim()
    })
    onClose()
  }

  return (
    <Modal title="DECOUPE.EXE" onClose={onClose} wide>
      <div className="trim">
        <p className="trim__file mono" title={clip.entry.fileName}>
          {clip.entry.fileName}
        </p>

        <div className="trim__player">
          {url ? (
            <video
              ref={video}
              src={url}
              controls
              preload="auto"
              onLoadedMetadata={() => seek(inSec)}
              onTimeUpdate={onTimeUpdate}
              onPause={() => setPlayingSelection(false)}
            />
          ) : (
            <p className="trim__loading mono">
              {previewError
                ? `${previewError.message} ${previewError.action ?? ''}`
                : 'PRÉPARATION DE L’APERÇU…'}
            </p>
          )}
        </div>

        <div
          className="timeline"
          onMouseDown={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            seek(((e.clientX - r.left) / r.width) * duration)
          }}
          title="Cliquer pour se placer"
        >
          <div className="timeline__kept" style={{ left: pct(inSec), width: pct(kept) }} />
          <div className="timeline__head" style={{ left: pct(current) }} />
        </div>

        <div className="trim__marks">
          <div className="trim__mark">
            <span className="field__label mono">ENTRÉE</span>
            <div className="trim__time">
              <button className="btn btn--small" onClick={() => markIn(inSec - STEP)}>
                −0,1
              </button>
              <span className="mono">{formatPrecise(inSec)}</span>
              <button className="btn btn--small" onClick={() => markIn(inSec + STEP)}>
                +0,1
              </button>
            </div>
            <button className="btn" onClick={() => markIn(video.current?.currentTime ?? current)}>
              ⟦ Entrée ici (I)
            </button>
          </div>

          <div className="trim__center">
            <span className="field__label mono">POSITION</span>
            <span className="trim__current mono">{formatPrecise(current)}</span>
            <button className="btn" onClick={playSelection} disabled={!url}>
              ▶ Lire la sélection
            </button>
          </div>

          <div className="trim__mark trim__mark--out">
            <span className="field__label mono">SORTIE</span>
            <div className="trim__time">
              <button className="btn btn--small" onClick={() => markOut(outSec - STEP)}>
                −0,1
              </button>
              <span className="mono">{formatPrecise(outSec)}</span>
              <button className="btn btn--small" onClick={() => markOut(outSec + STEP)}>
                +0,1
              </button>
            </div>
            <button className="btn" onClick={() => markOut(video.current?.currentTime ?? current)}>
              Sortie ici (O) ⟧
            </button>
          </div>
        </div>

        <label className="field">
          <span className="field__label mono">TITRE DU CLIP (CHAPITRES YOUTUBE)</span>
          <input
            className="input"
            value={title}
            maxLength={60}
            placeholder={clip.entry.fileName.replace(/\.[^.]+$/, '')}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
            }}
          />
        </label>

        <div className="trim__footer">
          <span className="mono render__sub">
            DURÉE GARDÉE {formatPrecise(kept)} / {formatPrecise(duration)}
          </span>
          {trimmed && (
            <button
              className="link"
              onClick={() => {
                setInSec(0)
                setOutSec(duration)
              }}
            >
              Réinitialiser la découpe
            </button>
          )}
          <span className="statusbar__spacer" />
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn btn--primary" onClick={save}>
            Valider
          </button>
        </div>
      </div>
    </Modal>
  )
}
