import { join } from 'node:path'
import { app, BrowserWindow, dialog, session, shell } from 'electron'
import { registerIpc } from './ipc'
import { buildMenu } from './menu'
import { cancelRender, cleanupStaleRenders, isRendering } from './render/pipeline'
import { APP_URL, handleAppScheme, handleMediaScheme, registerSchemes } from './protocol'

const devServerUrl = process.env['ELECTRON_RENDERER_URL']

app.enableSandbox()
registerSchemes()

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    title: 'BestofBuilder',
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    show: false,
    backgroundColor: '#06070D',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => (mainWindow = null))

  // Fermer pendant un rendu : on demande confirmation, puis on annule proprement (temporaires nettoyés).
  let closingAfterCancel = false
  mainWindow.on('close', (event) => {
    if (closingAfterCancel || !isRendering() || !mainWindow) return
    event.preventDefault()
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      title: 'Rendu en cours',
      message: 'Un rendu est en cours.',
      detail: 'Si tu quittes maintenant, le rendu sera annulé.',
      buttons: ['Continuer le rendu', 'Annuler le rendu et quitter'],
      defaultId: 0,
      cancelId: 0
    })
    if (choice === 1) {
      closingAfterCancel = true
      void cancelRender().finally(() => mainWindow?.close())
    }
  })

  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl)
  } else {
    void mainWindow.loadURL(APP_URL)
  }
}

/** Aucune navigation ni fenêtre externe : l'appli n'affiche que ses propres pages. */
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, url) => {
    const own = devServerUrl ? url.startsWith(devServerUrl) : url === APP_URL
    if (!own) event.preventDefault()
  })
  contents.on('will-attach-webview', (event) => event.preventDefault())
  contents.setWindowOpenHandler(({ url }) => {
    // Les liens web s'ouvrent dans le navigateur par défaut, jamais dans l'appli.
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
})

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

void app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false)
  )
  handleAppScheme(join(import.meta.dirname, '../renderer'))
  handleMediaScheme()
  void cleanupStaleRenders()
  registerIpc()
  buildMenu()
  createWindow()
})

app.on('window-all-closed', () => app.quit())
