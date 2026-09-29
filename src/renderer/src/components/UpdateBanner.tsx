import { useEffect, useState } from 'react'
import type { UpdateStatus } from '@shared/types'

/** Bandeau discret : téléchargement d'une mise à jour, puis bouton pour redémarrer. */
export function UpdateBanner({ rendering }: { rendering: boolean }) {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })

  useEffect(() => {
    void window.bob.update.getStatus().then(setStatus)
    return window.bob.update.onStatus(setStatus)
  }, [])

  if (status.state === 'downloading') {
    return (
      <div className="update mono" role="status">
        <span className="blink">▮</span> MISE À JOUR {status.version} DISPONIBLE · TÉLÉCHARGEMENT{' '}
        {status.percent} %
      </div>
    )
  }
  if (status.state === 'ready') {
    return (
      <div className="update update--ready" role="status">
        <span className="mono">VERSION {status.version} PRÊTE</span>
        <span className="update__hint">
          {rendering
            ? 'Elle sera installée après le rendu en cours.'
            : 'Elle s’installera aussi automatiquement à la fermeture de l’appli.'}
        </span>
        <button
          className="btn btn--primary btn--small"
          disabled={rendering}
          onClick={() => void window.bob.update.install()}
        >
          Redémarrer pour mettre à jour
        </button>
      </div>
    )
  }
  return null
}
