import { nvencTestArgs, type VideoEncoder } from './commands'
import { ffmpegPath } from './paths'
import { runProcess } from './run'

let detection: Promise<VideoEncoder> | null = null

/**
 * NVENC si la carte graphique et le pilote le permettent, sinon x264 (processeur).
 * Le test n'est fait qu'une fois par lancement.
 */
export function detectEncoder(): Promise<VideoEncoder> {
  detection ??= runProcess(ffmpegPath(), nvencTestArgs())
    .then(({ code }): VideoEncoder => (code === 0 ? 'h264_nvenc' : 'libx264'))
    .catch((): VideoEncoder => 'libx264')
  return detection
}
