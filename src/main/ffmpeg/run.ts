import { spawn } from 'node:child_process'
import { parseProgressLine } from './commands'

export interface RunResult {
  code: number | null
  stdout: string
  stderr: string
}

/** Lance un binaire avec des arguments sous forme de tableau (pas de shell : espaces et accents sûrs). */
export function runProcess(bin: string, args: readonly string[]): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const out: Buffer[] = []
    const err: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => out.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => err.push(chunk))
    child.on('error', reject)
    child.on('close', (code) =>
      resolve({
        code,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8')
      })
    )
  })
}

export interface FfmpegRunOptions {
  /** Position atteinte dans la sortie (s), lue depuis `-progress pipe:1`. */
  onProgress?: (outTimeSec: number) => void
  /** Sortie d'erreur brute de ffmpeg (pour le journal). */
  onStderr?: (text: string) => void
  /** Interrompt le processus (annulation). */
  signal?: AbortSignal
}

/**
 * Lance ffmpeg en suivant sa progression. Résout avec le code de sortie et les dernières lignes
 * d'erreur ; rejette avec `signal.reason` si l'annulation est demandée.
 */
export function runFfmpeg(
  bin: string,
  args: readonly string[],
  { onProgress, onStderr, signal }: FfmpegRunOptions = {}
): Promise<{ code: number | null; stderrTail: string }> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason)
      return
    }
    const child = spawn(bin, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let pending = ''
    let tail = ''

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      const lines = (pending + chunk).split(/\r?\n/)
      pending = lines.pop() ?? ''
      for (const line of lines) {
        const { outTimeSec } = parseProgressLine(line)
        if (outTimeSec !== undefined) onProgress?.(outTimeSec)
      }
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      onStderr?.(chunk)
      tail = (tail + chunk).slice(-4000)
    })

    const abort = () => child.kill()
    signal?.addEventListener('abort', abort, { once: true })

    child.on('error', (err) => {
      signal?.removeEventListener('abort', abort)
      reject(err)
    })
    child.on('close', (code) => {
      signal?.removeEventListener('abort', abort)
      if (signal?.aborted) reject(signal.reason)
      else resolve({ code, stderrTail: tail })
    })
  })
}
