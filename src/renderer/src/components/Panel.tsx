import type { ReactNode } from 'react'

interface PanelProps {
  /** Titre façon nom de programme, ex. « MONTAGE.EXE ». */
  title: string
  status?: ReactNode
  className?: string
  children: ReactNode
}

/** Panneau façon fenêtre rétro, avec barre de titre et coins de visée. */
export function Panel({ title, status, className, children }: PanelProps) {
  return (
    <section className={`panel ${className ?? ''}`}>
      <span className="panel__corner panel__corner--tl" aria-hidden />
      <span className="panel__corner panel__corner--br" aria-hidden />
      <header className="panel__bar">
        <span className="panel__title">{title}</span>
        {status && <span className="panel__status">{status}</span>}
        <span className="panel__buttons" aria-hidden>
          <i />
          <i />
          <i />
        </span>
      </header>
      <div className="panel__body">{children}</div>
    </section>
  )
}
