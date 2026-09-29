import type {
  AppInfo,
  AssetKind,
  ClipInfo,
  EditableSettings,
  PresetId,
  RenderFailure,
  RenderJob,
  RenderOutcome,
  RenderProgress,
  Result,
  ScanResult,
  SettingsView,
  UpdateStatus
} from './types'

/** Noms des canaux IPC (source unique partagée par main et preload). */
export const IPC = {
  appInfo: 'app:info',
  settingsGet: 'settings:get',
  settingsSetPreset: 'settings:set-preset',
  settingsUpdate: 'settings:update',
  settingsPickOutputFolder: 'settings:pick-output-folder',
  settingsPickAsset: 'settings:pick-asset',
  settingsClearAsset: 'settings:clear-asset',
  libraryPickFolder: 'library:pick-folder',
  libraryOpenLast: 'library:open-last',
  libraryRescan: 'library:rescan',
  libraryAnalyze: 'library:analyze',
  libraryPreparePreview: 'library:prepare-preview',
  renderStart: 'render:start',
  renderCancel: 'render:cancel',
  renderProgress: 'render:progress',
  renderShowOutput: 'render:show-output',
  renderOpenLog: 'render:open-log',
  renderCopyChapters: 'render:copy-chapters',
  updateStatus: 'update:status',
  updateGetStatus: 'update:get-status',
  updateInstall: 'update:install'
} as const

export type RenderResult = { ok: true; data: RenderOutcome } | { ok: false; error: RenderFailure }

/** API exposée au renderer via `window.bob`. */
export interface BobApi {
  app: {
    info(): Promise<AppInfo>
  }
  settings: {
    get(): Promise<SettingsView>
    setPreset(presetId: PresetId): Promise<SettingsView>
    /** Modifie les réglages simples (transition, filigrane, volume). */
    update(patch: Partial<EditableSettings>): Promise<SettingsView>
    /** Ouvre le sélecteur du dossier de sortie. */
    pickOutputFolder(): Promise<SettingsView>
    /** Ouvre le sélecteur de fichier pour l'intro, l'outro ou le filigrane. */
    pickAsset(kind: AssetKind): Promise<SettingsView>
    clearAsset(kind: AssetKind): Promise<SettingsView>
  }
  library: {
    /** Ouvre le sélecteur de dossier. `data` vaut null si l'utilisateur annule. */
    pickFolder(): Promise<Result<ScanResult | null>>
    /** Rouvre le dernier dossier utilisé. `data` vaut null s'il n'y en a pas. */
    openLast(): Promise<Result<ScanResult | null>>
    rescan(): Promise<Result<ScanResult | null>>
    analyze(clipId: string): Promise<Result<ClipInfo>>
    /** URL lisible par le lecteur intégré (copie .mp4 pour les .mkv). */
    preparePreview(clipId: string): Promise<Result<string>>
  }
  render: {
    /** Lance le rendu et attend sa fin (succès, échec ou annulation). */
    start(job: RenderJob): Promise<RenderResult>
    cancel(): Promise<void>
    /** S'abonne à la progression. Renvoie la fonction de désabonnement. */
    onProgress(listener: (progress: RenderProgress) => void): () => void
    /** Montre le dernier fichier rendu dans l'Explorateur. */
    showOutput(): Promise<void>
    /** Ouvre le journal du dernier rendu. */
    openLog(): Promise<void>
    /** Copie les chapitres du dernier rendu dans le presse-papiers. */
    copyChapters(): Promise<boolean>
  }
  update: {
    getStatus(): Promise<UpdateStatus>
    /** S'abonne aux changements d'état. Renvoie la fonction de désabonnement. */
    onStatus(listener: (status: UpdateStatus) => void): () => void
    /** Redémarre l'appli pour installer la mise à jour téléchargée (refusé pendant un rendu). */
    install(): Promise<boolean>
  }
}
