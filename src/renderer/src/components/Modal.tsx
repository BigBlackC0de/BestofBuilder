import { useEffect, type ReactNode } from 'react'
import { Panel } from './Panel'

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}

/** Fenêtre par-dessus l'appli, fermée par Échap, la croix ou un clic à côté. */
export function Modal({ title, onClose, children, wide }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="modal"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <Panel
        title={title}
        className={`modal__panel ${wide ? 'modal__panel--wide' : ''}`}
        status={
          <button className="modal__close" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        }
      >
        {children}
      </Panel>
    </div>
  )
}
