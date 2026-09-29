import type { BobApi } from '../shared/ipc'

declare global {
  interface Window {
    bob: BobApi
  }
}

export {}
