import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  shell,
  type IpcMainInvokeEvent,
  type OpenDialogOptions
} from 'electron'
import { IPC } from '@shared/ipc'
import {
  PRESETS,
  VIDEO_EXTENSIONS,
  type AppInfo,
  type AssetKind,
  type RenderItem,
  type RenderJob,
  type ScanResult,
  type SettingsView
} from '@shared/types'
import { ASSET_PATH_KEY, assetInfo } from './assets'
import { toResult } from './errors'
import { detectEncoder } from './ffmpeg/encoder'
import { ffmpegPath, ffprobePath } from './ffmpeg/paths'
import { runProcess } from './ffmpeg/run'
import { analyzeClip } from './library/analyze'
import { preparePreview } from './library/preview'
import { scanFolder } from './library/scan'
import {
  cancelRender,
  defaultOutputFolder,
  getLastChapters,
  getLastLogPath,
  getLastOutputPath,
  startRender
} from './render/pipeline'
import { getSettings, updateEditableSettings, updateSettings } from './settings'
import { getUpdateStatus, installUpdate } from './updater'

async function binaryVersion(getPath: () => string): Promise<string | null> {
  try {
    const { stdout } = await runProcess(getPath(), ['-hide_banner', '-version'])
    // « 6.1.1-essentials_build-www.gyan.dev » → « 6.1.1 »
    return /version (\d[\w.]*)/.exec(stdout)?.[1] ?? null
  } catch {
    return null
  }
}

/** Réglages envoyés à l'interface : dossier de sortie résolu et infos sur les fichiers d'habillage. */
async function settingsForUi(): Promise<SettingsView> {
  const s = getSettings()
  const [intro, outro, watermark] = await Promise.all([
    assetInfo('intro', s.introPath),
    assetInfo('outro', s.outroPath),
    assetInfo('watermark', s.watermarkPath)
  ])
  return { ...s, outputFolder: defaultOutputFolder(), assets: { intro, outro, watermark } }
}

async function showOpenDialog(event: IpcMainInvokeEvent, options: OpenDialogOptions) {
  const win = BrowserWindow.fromWebContents(event.sender)
  const picked = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options)
  return picked.canceled ? undefined : picked.filePaths[0]
}

const isPresetId = (v: unknown): v is RenderJob['presetId'] => PRESETS.some((p) => p.id === v)
const isAssetKind = (v: unknown): v is AssetKind =>
  v === 'intro' || v === 'outro' || v === 'watermark'
const isTime = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

function parseItem(raw: unknown): RenderItem {
  const item = raw as Partial<RenderItem> | null
  if (
    !item ||
    typeof item.clipId !== 'string' ||
    !isTime(item.inSec) ||
    !(item.outSec === null || isTime(item.outSec)) ||
    typeof item.title !== 'string'
  ) {
    throw new TypeError('Clip invalide dans la demande de rendu')
  }
  return {
    clipId: item.clipId,
    inSec: item.inSec,
    outSec: item.outSec,
    title: item.title.slice(0, 100)
  }
}

function parseJob(raw: unknown): RenderJob {
  const job = raw as Partial<RenderJob> | null
  if (
    !job ||
    !Array.isArray(job.items) ||
    !isPresetId(job.presetId) ||
    typeof job.fileName !== 'string'
  ) {
    throw new TypeError('Demande de rendu invalide')
  }
  return { items: job.items.map(parseItem), presetId: job.presetId, fileName: job.fileName }
}

async function openFolder(folder: string): Promise<ScanResult> {
  const result = await scanFolder(folder)
  updateSettings({ lastFolder: folder })
  return result
}

const ASSET_DIALOG: Record<AssetKind, OpenDialogOptions> = {
  intro: {
    title: 'Choisir la vidéo d’intro',
    filters: [{ name: 'Vidéos', extensions: VIDEO_EXTENSIONS.map((e) => e.slice(1)) }]
  },
  outro: {
    title: 'Choisir la vidéo d’outro',
    filters: [{ name: 'Vidéos', extensions: VIDEO_EXTENSIONS.map((e) => e.slice(1)) }]
  },
  watermark: {
    title: 'Choisir l’image du filigrane (PNG transparent conseillé)',
    filters: [{ name: 'Images', extensions: ['png'] }]
  }
}

export function registerIpc(): void {
  ipcMain.handle(IPC.appInfo, async (): Promise<AppInfo> => {
    const [ffmpegVersion, ffprobeVersion, encoder] = await Promise.all([
      binaryVersion(ffmpegPath),
      binaryVersion(ffprobePath),
      detectEncoder().catch(() => null)
    ])
    return { version: app.getVersion(), ffmpegVersion, ffprobeVersion, encoder }
  })

  ipcMain.handle(IPC.settingsGet, () => settingsForUi())

  ipcMain.handle(IPC.settingsSetPreset, (_event, presetId: unknown) => {
    if (isPresetId(presetId)) updateSettings({ presetId })
    return settingsForUi()
  })

  ipcMain.handle(IPC.settingsUpdate, (_event, patch: unknown) => {
    updateEditableSettings(patch)
    return settingsForUi()
  })

  ipcMain.handle(IPC.settingsPickOutputFolder, async (event) => {
    const folder = await showOpenDialog(event, {
      title: 'Choisir le dossier où enregistrer les best-of',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: defaultOutputFolder()
    })
    if (folder) updateSettings({ outputFolder: folder })
    return settingsForUi()
  })

  ipcMain.handle(IPC.settingsPickAsset, async (event, kind: unknown) => {
    if (!isAssetKind(kind)) throw new TypeError('Type de fichier invalide')
    const current = getSettings()[ASSET_PATH_KEY[kind]]
    const file = await showOpenDialog(event, {
      ...ASSET_DIALOG[kind],
      properties: ['openFile'],
      defaultPath: current ?? undefined
    })
    if (file) updateSettings({ [ASSET_PATH_KEY[kind]]: file })
    return settingsForUi()
  })

  ipcMain.handle(IPC.settingsClearAsset, (_event, kind: unknown) => {
    if (!isAssetKind(kind)) throw new TypeError('Type de fichier invalide')
    updateSettings({ [ASSET_PATH_KEY[kind]]: null })
    return settingsForUi()
  })

  ipcMain.handle(IPC.libraryPickFolder, (event) =>
    toResult(async () => {
      const folder = await showOpenDialog(event, {
        title: 'Choisir le dossier des clips de la semaine',
        properties: ['openDirectory'],
        defaultPath: getSettings().lastFolder ?? undefined
      })
      return folder ? openFolder(folder) : null
    })
  )

  const reopenLast = () =>
    toResult(async () => {
      const folder = getSettings().lastFolder
      return folder ? openFolder(folder) : null
    })
  ipcMain.handle(IPC.libraryOpenLast, reopenLast)
  ipcMain.handle(IPC.libraryRescan, reopenLast)

  ipcMain.handle(IPC.libraryAnalyze, (_event, clipId: unknown) =>
    toResult(async () => {
      if (typeof clipId !== 'string') throw new TypeError('clipId invalide')
      return analyzeClip(clipId)
    })
  )

  ipcMain.handle(IPC.libraryPreparePreview, (_event, clipId: unknown) =>
    toResult(async () => {
      if (typeof clipId !== 'string') throw new TypeError('clipId invalide')
      return preparePreview(clipId)
    })
  )

  ipcMain.handle(IPC.renderStart, (event, rawJob: unknown) => {
    const job = parseJob(rawJob)
    const sender = event.sender
    return startRender(job, (progress) => {
      if (!sender.isDestroyed()) sender.send(IPC.renderProgress, progress)
    })
  })

  ipcMain.handle(IPC.renderCancel, () => cancelRender())

  ipcMain.handle(IPC.renderShowOutput, () => {
    const path = getLastOutputPath()
    if (path) shell.showItemInFolder(path)
  })

  ipcMain.handle(IPC.renderOpenLog, async () => {
    const path = getLastLogPath()
    if (path) await shell.openPath(path)
  })

  ipcMain.handle(IPC.updateGetStatus, () => getUpdateStatus())
  ipcMain.handle(IPC.updateInstall, () => installUpdate())

  ipcMain.handle(IPC.renderCopyChapters, () => {
    const chapters = getLastChapters()
    if (chapters) clipboard.writeText(chapters)
    return chapters !== null
  })
}
