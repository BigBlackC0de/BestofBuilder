// Convertit build/icon.svg en build/icon.png (1024 × 1024, fond transparent).
// Lancement : npm run icon  (utilise Electron, déjà installé pour le développement).
const { app, BrowserWindow } = require('electron')
const { readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const SIZE = 1024
const root = join(__dirname, '..')

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const svg = readFileSync(join(root, 'build', 'icon.svg'), 'utf8')
  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    frame: false,
    transparent: true,
    useContentSize: true,
    webPreferences: { offscreen: true, sandbox: true }
  })
  const html = `<html><body style="margin:0;background:transparent;overflow:hidden">${svg}</body></html>`
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  await new Promise((r) => setTimeout(r, 300))
  let image = await win.webContents.capturePage()
  if (image.getSize().width !== SIZE)
    image = image.resize({ width: SIZE, height: SIZE, quality: 'best' })
  writeFileSync(join(root, 'build', 'icon.png'), image.toPNG())
  console.log(`build/icon.png écrit (${image.getSize().width}×${image.getSize().height})`)
  app.quit()
})
