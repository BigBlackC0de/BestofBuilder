import { useCallback, useEffect, useRef, useState } from 'react'
import { formatDuration } from '@shared/format'
import type { AppInfo, Result, ScanResult, SettingsView, UserError } from '@shared/types'
import { ClipList } from './components/ClipList'
import { keptDuration, NO_EDIT, type ClipState } from './components/ClipRow'
import { Panel } from './components/Panel'
import { RenderPanel } from './components/RenderPanel'
import { SettingsModal } from './components/SettingsModal'
import { TrimModal } from './components/TrimModal'
import { UpdateBanner } from './components/UpdateBanner'

/**
 * Relecture du même dossier : on garde la sélection, l'ordre et les découpes des clips déjà
 * connus ; les nouveaux clips arrivent à la fin, cochés.
 */
function mergeScan(prev: ClipState[], scan: ScanResult): ClipState[] {
  const byId = new Map(scan.clips.map((entry) => [entry.id, entry]))
  const kept = prev
    .filter((c) => byId.has(c.entry.id))
    .map((c) => ({ ...c, entry: byId.get(c.entry.id) ?? c.entry, error: undefined }))
  const known = new Set(kept.map((c) => c.entry.id))
  const added = scan.clips
    .filter((entry) => !known.has(entry.id))
    .map((entry) => ({ entry, selected: true, edit: NO_EDIT }))
  return [...kept, ...added]
}

export function App() {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [folder, setFolder] = useState<string | null>(null)
  const [clips, setClips] = useState<ClipState[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<UserError | null>(null)
  const [rendering, setRendering] = useState(false)
  const [settings, setSettings] = useState<SettingsView | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  // Incrémenté à chaque lecture de dossier pour ignorer les analyses d'un dossier précédent.
  const generation = useRef(0)
  const currentFolder = useRef<string | null>(null)

  const applyScan = useCallback((result: Result<ScanResult | null>) => {
    if (!result.ok) {
      setError(result.error)
      return
    }
    if (!result.data) return
    const gen = ++generation.current
    setError(null)
    const scan = result.data
    const sameFolder = currentFolder.current === scan.folder
    currentFolder.current = scan.folder
    setFolder(scan.folder)
    setClips((prev) =>
      sameFolder
        ? mergeScan(prev, scan)
        : scan.clips.map((entry) => ({ entry, selected: true, edit: NO_EDIT }))
    )

    for (const entry of result.data.clips) {
      void window.bob.library.analyze(entry.id).then((res) => {
        if (gen !== generation.current) return
        setClips((prev) =>
          prev.map((c) =>
            c.entry.id === entry.id
              ? res.ok
                ? { ...c, info: res.data }
                : { ...c, info: undefined, error: res.error, selected: false }
              : c
          )
        )
      })
    }
  }, [])

  const run = useCallback(
    async (action: () => Promise<Result<ScanResult | null>>) => {
      setLoading(true)
      try {
        applyScan(await action())
      } finally {
        setLoading(false)
      }
    },
    [applyScan]
  )

  useEffect(() => {
    void window.bob.app.info().then(setAppInfo)
    void window.bob.settings.get().then(setSettings)
    void window.bob.library.openLast().then(applyScan)
  }, [applyScan])

  const analyzed = clips.filter((c) => c.info).length
  const analyzing = analyzed + clips.filter((c) => c.error).length < clips.length
  const selected = clips.filter((c) => c.selected)
  const selectedSec = selected.reduce((sum, c) => sum + keptDuration(c), 0)
  const editing = clips.find((c) => c.entry.id === editingId)
  const closeSettings = useCallback(() => setSettingsOpen(false), [])
  const closeTrim = useCallback(() => setEditingId(null), [])
  const allSelectable = clips.filter((c) => !c.error)
  const allSelected = allSelectable.length > 0 && allSelectable.every((c) => c.selected)
  const setAll = (value: boolean) =>
    setClips((prev) => prev.map((c) => (c.error ? c : { ...c, selected: value })))

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="logo glitch" data-text="BESTOFBUILDER">
          BESTOFBUILDER
        </h1>
        <span className="app__tagline mono">MONTAGE DE BEST-OF // HEBDO</span>
        <span className="statusbar__spacer" />
        <button
          className="btn"
          onClick={() => setSettingsOpen(true)}
          disabled={rendering || !settings}
        >
          ⚙ Réglages
        </button>
      </header>

      <UpdateBanner rendering={rendering} />

      {error && (
        <div className="alert" role="alert">
          <strong>{error.message}</strong>
          {error.action && <span>{error.action}</span>}
          <button className="alert__close" onClick={() => setError(null)} aria-label="Fermer">
            ×
          </button>
        </div>
      )}

      <main className="app__grid">
        <Panel
          title="MONTAGE.EXE"
          className="panel--montage"
          status={
            clips.length > 0 && (
              <span className="mono">
                {selected.length}/{clips.length} CLIPS · {formatDuration(selectedSec)}
                {analyzing && (
                  <span className="blink">
                    {' '}
                    · ANALYSE {analyzed}/{clips.length}
                  </span>
                )}
              </span>
            )
          }
        >
          <div className="toolbar">
            <button
              className="btn btn--primary"
              onClick={() => void run(window.bob.library.pickFolder)}
              disabled={loading || rendering}
            >
              Choisir le dossier
            </button>
            {folder && (
              <button
                className="btn"
                onClick={() => void run(window.bob.library.rescan)}
                disabled={loading || rendering}
              >
                Actualiser
              </button>
            )}
            <span className="toolbar__path mono" title={folder ?? undefined}>
              {folder ?? 'AUCUN DOSSIER'}
            </span>
            {clips.length > 0 && (
              <button
                className="btn btn--small"
                onClick={() => setAll(!allSelected)}
                disabled={rendering}
              >
                {allSelected ? 'Tout décocher' : 'Tout cocher'}
              </button>
            )}
          </div>

          {clips.length > 0 ? (
            <ClipList clips={clips} locked={rendering} onChange={setClips} onEdit={setEditingId} />
          ) : (
            <div className="empty">
              <p className="empty__title">
                {folder ? 'Aucune vidéo dans ce dossier' : 'Aucun dossier sélectionné'}
              </p>
              <p className="empty__hint">
                {folder
                  ? 'Formats reconnus : .mp4, .mkv, .mov, .webm. Choisis un autre dossier ou ajoute tes clips puis clique sur « Actualiser ».'
                  : 'Choisis le dossier qui contient les clips OBS et Twitch de la semaine.'}
              </p>
            </div>
          )}
        </Panel>

        <RenderPanel
          selected={selected}
          analyzing={selected.some((c) => !c.info)}
          appInfo={appInfo}
          settings={settings}
          onSettings={setSettings}
          onOpenSettings={() => setSettingsOpen(true)}
          onRunningChange={setRendering}
        />
      </main>

      {settingsOpen && settings && (
        <SettingsModal settings={settings} onChange={setSettings} onClose={closeSettings} />
      )}
      {editing && (
        <TrimModal
          key={editing.entry.id}
          clip={editing}
          onSave={(edit) =>
            setClips((prev) =>
              prev.map((c) => (c.entry.id === editing.entry.id ? { ...c, edit } : c))
            )
          }
          onClose={closeTrim}
        />
      )}

      <footer className="statusbar mono">
        <span>v{appInfo?.version ?? '…'}</span>
        <span className={appInfo && !appInfo.ffmpegVersion ? 'warn' : ''}>
          FFMPEG {appInfo ? (appInfo.ffmpegVersion ?? 'INTROUVABLE') : '…'}
        </span>
        <span className={appInfo && !appInfo.ffprobeVersion ? 'warn' : ''}>
          FFPROBE {appInfo ? (appInfo.ffprobeVersion ?? 'INTROUVABLE') : '…'}
        </span>
        {appInfo?.encoder && (
          <span className={appInfo.encoder === 'h264_nvenc' ? 'ok' : 'warn'}>
            {appInfo.encoder === 'h264_nvenc' ? 'NVENC ✓' : 'NVENC INDISPONIBLE · x264'}
          </span>
        )}
        <span className="statusbar__spacer" />
        <span className="statusbar__ok">● 100 % LOCAL</span>
      </footer>
    </div>
  )
}
