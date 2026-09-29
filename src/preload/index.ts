import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type BobApi } from '@shared/ipc'
import type { RenderProgress, UpdateStatus } from '@shared/types'

const api: BobApi = {
  app: {
    info: () => ipcRenderer.invoke(IPC.appInfo)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    setPreset: (presetId) => ipcRenderer.invoke(IPC.settingsSetPreset, presetId),
    update: (patch) => ipcRenderer.invoke(IPC.settingsUpdate, patch),
    pickOutputFolder: () => ipcRenderer.invoke(IPC.settingsPickOutputFolder),
    pickAsset: (kind) => ipcRenderer.invoke(IPC.settingsPickAsset, kind),
    clearAsset: (kind) => ipcRenderer.invoke(IPC.settingsClearAsset, kind)
  },
  library: {
    pickFolder: () => ipcRenderer.invoke(IPC.libraryPickFolder),
    openLast: () => ipcRenderer.invoke(IPC.libraryOpenLast),
    rescan: () => ipcRenderer.invoke(IPC.libraryRescan),
    analyze: (clipId) => ipcRenderer.invoke(IPC.libraryAnalyze, clipId),
    preparePreview: (clipId) => ipcRenderer.invoke(IPC.libraryPreparePreview, clipId)
  },
  render: {
    start: (job) => ipcRenderer.invoke(IPC.renderStart, job),
    cancel: () => ipcRenderer.invoke(IPC.renderCancel),
    onProgress: (listener) => {
      const handler = (_event: IpcRendererEvent, progress: RenderProgress) => listener(progress)
      ipcRenderer.on(IPC.renderProgress, handler)
      return () => ipcRenderer.removeListener(IPC.renderProgress, handler)
    },
    showOutput: () => ipcRenderer.invoke(IPC.renderShowOutput),
    openLog: () => ipcRenderer.invoke(IPC.renderOpenLog),
    copyChapters: () => ipcRenderer.invoke(IPC.renderCopyChapters)
  },
  update: {
    getStatus: () => ipcRenderer.invoke(IPC.updateGetStatus),
    onStatus: (listener) => {
      const handler = (_event: IpcRendererEvent, status: UpdateStatus) => listener(status)
      ipcRenderer.on(IPC.updateStatus, handler)
      return () => ipcRenderer.removeListener(IPC.updateStatus, handler)
    },
    install: () => ipcRenderer.invoke(IPC.updateInstall)
  }
}

contextBridge.exposeInMainWorld('bob', api)
