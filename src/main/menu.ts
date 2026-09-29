import { app, Menu, shell, type MenuItemConstructorOptions } from 'electron'
import { thumbnailDir } from './library/analyze'

export function buildMenu(): void {
  const view: MenuItemConstructorOptions[] = [
    { role: 'reload', label: 'Recharger' },
    { role: 'resetZoom', label: 'Taille réelle' },
    { role: 'zoomIn', label: 'Zoom avant' },
    { role: 'zoomOut', label: 'Zoom arrière' },
    { type: 'separator' },
    { role: 'togglefullscreen', label: 'Plein écran' }
  ]
  if (!app.isPackaged) view.push({ role: 'toggleDevTools', label: 'Outils de développement' })

  const template: MenuItemConstructorOptions[] = [
    { label: 'Fichier', submenu: [{ role: 'quit', label: 'Quitter' }] },
    { label: 'Affichage', submenu: view },
    {
      label: 'Aide',
      submenu: [
        {
          label: 'Ouvrir le dossier des journaux',
          click: () => void shell.openPath(app.getPath('logs'))
        },
        {
          label: 'Ouvrir le cache des miniatures',
          click: () => void shell.openPath(thumbnailDir())
        },
        { type: 'separator' },
        { label: `BestofBuilder ${app.getVersion()}`, enabled: false }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
