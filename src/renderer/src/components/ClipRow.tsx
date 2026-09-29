import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { formatDuration, formatResolution, formatSize } from '@shared/format'
import type { ClipEdit, ClipEntry, ClipInfo, UserError } from '@shared/types'

export interface ClipState {
  entry: ClipEntry
  info?: ClipInfo
  error?: UserError
  selected: boolean
  /** Découpe et titre choisis dans DECOUPE.EXE. */
  edit: ClipEdit
}

export const NO_EDIT: ClipEdit = { inSec: 0, outSec: null, title: '' }

/** Durée gardée après découpe (s). */
export function keptDuration(clip: ClipState): number {
  const duration = clip.info?.durationSec ?? 0
  return Math.max(0, Math.min(clip.edit.outSec ?? duration, duration) - clip.edit.inSec)
}

export const isTrimmed = (clip: ClipState): boolean =>
  clip.edit.inSec > 0 || clip.edit.outSec !== null

const dateFormat = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit'
})

interface ClipRowProps {
  clip: ClipState
  /** Position dans le best-of (clips cochés uniquement), null si décoché. */
  order: number | null
  locked: boolean
  onToggle: (id: string) => void
  onEdit: (id: string) => void
}

export function ClipRow({ clip, order, locked, onToggle, onEdit }: ClipRowProps) {
  const { entry, info, error, selected } = clip
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: entry.id, disabled: locked })

  const classes = ['clip']
  if (error) classes.push('clip--error')
  if (!selected) classes.push('clip--off')
  if (isDragging) classes.push('clip--dragging')

  return (
    <li
      ref={setNodeRef}
      className={classes.join(' ')}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <button
        ref={setActivatorNodeRef}
        className="clip__grip"
        aria-label={`Déplacer ${entry.fileName}`}
        title="Glisser pour réordonner"
        disabled={locked}
        {...attributes}
        {...listeners}
      >
        ⋮⋮
      </button>

      <label className="clip__check" title={error ? 'Ce clip ne peut pas être utilisé' : undefined}>
        <input
          type="checkbox"
          checked={selected}
          disabled={locked || !!error}
          onChange={() => onToggle(entry.id)}
          aria-label={`Inclure ${entry.fileName}`}
        />
        <span className="clip__index mono">
          {order === null ? '··' : String(order).padStart(2, '0')}
        </span>
      </label>

      <div className="clip__thumb">
        {info?.thumbnailUrl ? (
          <img src={info.thumbnailUrl} alt="" loading="lazy" draggable={false} />
        ) : (
          <span className="clip__thumb-placeholder mono">
            {error ? 'ERREUR' : info ? 'SANS APERÇU' : 'ANALYSE…'}
          </span>
        )}
        {info && (
          <span className={`clip__duration mono ${isTrimmed(clip) ? 'clip__duration--cut' : ''}`}>
            {isTrimmed(clip) && '✂ '}
            {formatDuration(keptDuration(clip))}
          </span>
        )}
      </div>

      <div className="clip__main">
        {clip.edit.title && <span className="clip__title">{clip.edit.title}</span>}
        <span className="clip__name" title={entry.fileName}>
          {entry.fileName}
        </span>
        <span className="clip__meta mono">
          {dateFormat.format(entry.createdAt)} · {formatSize(entry.sizeBytes)}
        </span>
        {error && (
          <span className="clip__error">
            {error.message} {error.action}
          </span>
        )}
      </div>

      <div className="clip__tech mono">
        {info ? (
          <>
            <span className="tag tag--cyan">{formatResolution(info.width, info.height)}</span>
            <span className="tag">{Math.round(info.fps)} ips</span>
            <span className="tag">{info.videoCodec.toUpperCase()}</span>
            {info.hasAudio ? (
              <span className="tag">{info.audioCodec?.toUpperCase()}</span>
            ) : (
              <span className="tag tag--warn" title="Une piste silencieuse sera ajoutée au rendu">
                MUET
              </span>
            )}
          </>
        ) : (
          !error && <span className="blink">▮</span>
        )}
      </div>

      <button
        className="btn btn--small clip__edit"
        onClick={() => onEdit(entry.id)}
        disabled={locked || !info}
        title="Découper le clip et lui donner un titre"
      >
        ✂ Éditer
      </button>
    </li>
  )
}
