import { createWriteStream, type WriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'

function timestamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`
}

/** Journal d'un rendu : commandes ffmpeg complètes et leur sortie d'erreur. */
export class RenderLog {
  private constructor(
    readonly path: string,
    private readonly stream: WriteStream
  ) {}

  static async create(): Promise<RenderLog> {
    const dir = app.getPath('logs')
    await mkdir(dir, { recursive: true })
    const path = join(dir, `rendu-${timestamp()}.log`)
    return new RenderLog(path, createWriteStream(path, { encoding: 'utf8' }))
  }

  line(text = ''): void {
    this.stream.write(text + '\n')
  }

  section(title: string): void {
    this.line()
    this.line(`===== ${title} [${new Date().toLocaleTimeString('fr-FR')}] =====`)
  }

  raw(text: string): void {
    this.stream.write(text)
  }

  close(): Promise<void> {
    return new Promise((resolve) => this.stream.end(resolve))
  }
}
