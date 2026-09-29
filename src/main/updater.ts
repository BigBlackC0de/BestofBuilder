/**
 * Mises à jour automatiques depuis les Releases GitHub du projet (dépôt public : aucun jeton
 * dans l'appli). C'est la seule connexion réseau de l'appli.
 */
import { app, BrowserWindow, dialog, shell } from 'electron'
import electronUpdater from 'electron-updater'
import { IPC } from '@shared/ipc'
import type { UpdateStatus } from '@shared/types'
import { isRendering } from './render/pipeline'

const { autoUpdater } = electronUpdater

export const RELEASES_URL = 'https://github.com/BigBlackC0de/BestofBuilder/releases'

let status: UpdateStatus = { state: 'idle' }
/** Vrai quand l'utilisateur a demandé la vérification (menu Aide) : on lui répond par une fenêtre. */
let manualCheck = false

export const getUpdateStatus = (): UpdateStatus => status

/** La version portable ne peut pas se remplacer elle-même. */
const isPortable = () => Boolean(process.env['PORTABLE_EXECUTABLE_DIR'])
const canUpdate = () => app.isPackaged && !isPortable()

function setStatus(next: UpdateStatus): void {
  status = next
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.webContents.isDestroyed()) win.webContents.send(IPC.updateStatus, status)
  }
}

function tellUser(message: string, detail?: string): void {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const options = { type: 'info' as const, title: 'Mises à jour', message, detail, buttons: ['OK'] }
  void (win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options))
}

export function initUpdater(): void {
  if (!canUpdate()) return
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => setStatus({ state: 'checking' }))
  autoUpdater.on('update-available', (info) =>
    setStatus({ state: 'downloading', version: info.version, percent: 0 })
  )
  autoUpdater.on('download-progress', (progress) => {
    if (status.state === 'downloading') {
      setStatus({ ...status, percent: Math.round(progress.percent) })
    }
  })
  autoUpdater.on('update-downloaded', (info) => {
    setStatus({ state: 'ready', version: info.version })
    manualCheck = false
  })
  autoUpdater.on('update-not-available', () => {
    setStatus({ state: 'up-to-date' })
    if (manualCheck) tellUser(`BestofBuilder ${app.getVersion()} est à jour.`)
    manualCheck = false
  })
  autoUpdater.on('error', (err) => {
    console.error('Mise à jour impossible', err)
    setStatus({ state: 'error', message: 'Vérification des mises à jour impossible.' })
    if (manualCheck) {
      tellUser(
        'Impossible de vérifier les mises à jour.',
        'Vérifie ta connexion internet, puis réessaie depuis le menu Aide.'
      )
    }
    manualCheck = false
  })

  // Vérification discrète quelques secondes après le démarrage.
  setTimeout(() => void autoUpdater.checkForUpdates().catch(() => {}), 5000)
}

/** Menu Aide → Vérifier les mises à jour. */
export function checkForUpdatesManually(): void {
  if (!app.isPackaged) {
    tellUser('Les mises à jour ne sont vérifiées que dans la version installée.')
    return
  }
  if (isPortable()) {
    tellUser(
      'La version portable ne se met pas à jour toute seule.',
      'Télécharge la dernière version sur la page GitHub du projet, qui va s’ouvrir.'
    )
    void shell.openExternal(RELEASES_URL)
    return
  }
  if (status.state === 'ready') {
    tellUser(
      `La version ${status.version} est prête.`,
      'Clique sur « Redémarrer pour mettre à jour » en haut de la fenêtre.'
    )
    return
  }
  if (status.state === 'downloading') {
    tellUser(`La version ${status.version} est en cours de téléchargement (${status.percent} %).`)
    return
  }
  manualCheck = true
  void autoUpdater.checkForUpdates().catch(() => {})
}

/** Redémarre pour installer. Refusé pendant un rendu pour ne pas le perdre. */
export function installUpdate(): boolean {
  if (status.state !== 'ready' || isRendering()) return false
  setImmediate(() => autoUpdater.quitAndInstall(false, true))
  return true
}
