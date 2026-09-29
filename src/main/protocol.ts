import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import { pathToFileURL } from 'node:url'
import { net, protocol } from 'electron'
import { MEDIA_SCHEME } from '@shared/types'
import { getClip, getPreview, getThumbnail } from './library/registry'
import { getSettings } from './settings'
import { parseRange } from './range'

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.mp4': 'video/mp4',
  // Chromium lit les .mov H.264 comme des .mp4 (même format de conteneur).
  '.mov': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm'
}

/**
 * Protocole qui sert l'interface packagée. Contrairement à `file://`, la page ne peut pas lire
 * d'autres fichiers du disque : seuls ceux du dossier de l'interface sont accessibles.
 */
export const APP_SCHEME = 'bob-app'
export const APP_URL = `${APP_SCHEME}://bundle/index.html`

/** À appeler avant l'événement `ready`. */
export function registerSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true }
    },
    {
      scheme: MEDIA_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
    }
  ])
}

export function handleAppScheme(rendererDir: string): void {
  const root = resolve(rendererDir)
  protocol.handle(APP_SCHEME, (request) => {
    const url = new URL(request.url)
    const file = resolve(root, '.' + decodeURIComponent(url.pathname))
    if (url.host !== 'bundle' || !file.startsWith(root + sep)) {
      return new Response(null, { status: 404 })
    }
    return net.fetch(pathToFileURL(file).toString())
  })
}

async function serveFile(path: string, request: Request): Promise<Response> {
  const { size } = await stat(path)
  const type = MIME[extname(path).toLowerCase()] ?? 'application/octet-stream'
  const rangeHeader = request.headers.get('range')
  const range = parseRange(rangeHeader, size)

  if (rangeHeader && !range) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
  }
  const start = range?.start ?? 0
  const end = range?.end ?? size - 1
  const body = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream
  return new Response(body, {
    status: range ? 206 : 200,
    headers: {
      'Content-Type': type,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
      ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {})
    }
  })
}

/** Fichier correspondant à une URL bob-media://, uniquement parmi ceux autorisés. */
function resolveMedia(host: string, id: string): string | undefined {
  switch (host) {
    case 'thumb':
      return getThumbnail(id)
    case 'clip':
      return getClip(id)?.path
    case 'preview':
      return getPreview(id)
    case 'asset':
      // Seul le filigrane (image) est affiché dans les réglages.
      return id === 'watermark' ? (getSettings().watermarkPath ?? undefined) : undefined
  }
  return undefined
}

/**
 * Sert uniquement les fichiers enregistrés, via un identifiant :
 * bob-media://thumb/<id>, clip/<id>, preview/<id> et asset/watermark.
 */
export function handleMediaScheme(): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    const url = new URL(request.url)
    const id = url.pathname.replace(/^\//, '')
    const path = resolveMedia(url.host, id)
    if (!path) return new Response(null, { status: 404 })
    try {
      return await serveFile(path, request)
    } catch {
      return new Response(null, { status: 404 })
    }
  })
}
