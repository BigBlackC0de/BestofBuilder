import Store from 'electron-store'
import {
  DEFAULT_PRESET,
  TRANSITION_MAX,
  TRANSITION_MIN,
  TRANSITIONS,
  WATERMARK_SIZE_MAX,
  WATERMARK_SIZE_MIN,
  type EditableSettings,
  type Settings
} from '@shared/types'

const DEFAULTS: Settings = {
  lastFolder: null,
  outputFolder: null,
  presetId: DEFAULT_PRESET,
  transition: 'fade',
  transitionDuration: 0.5,
  introPath: null,
  outroPath: null,
  watermarkPath: null,
  watermarkSize: 0.12,
  watermarkOpacity: 0.8,
  loudnorm: true
}

let store: Store<Settings> | null = null

function getStore(): Store<Settings> {
  store ??= new Store<Settings>({ name: 'settings', defaults: DEFAULTS })
  return store
}

export function getSettings(): Settings {
  return { ...DEFAULTS, ...getStore().store }
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const s = getStore()
  s.store = { ...getSettings(), ...patch }
  return getSettings()
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Applique une modification venue de l'interface, en ignorant les valeurs invalides. */
export function updateEditableSettings(raw: unknown): Settings {
  const input = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<EditableSettings>
  const patch: Partial<Settings> = {}
  if (TRANSITIONS.some((t) => t.id === input.transition)) patch.transition = input.transition
  if (isNumber(input.transitionDuration)) {
    patch.transitionDuration = clamp(input.transitionDuration, TRANSITION_MIN, TRANSITION_MAX)
  }
  if (isNumber(input.watermarkSize)) {
    patch.watermarkSize = clamp(input.watermarkSize, WATERMARK_SIZE_MIN, WATERMARK_SIZE_MAX)
  }
  if (isNumber(input.watermarkOpacity)) {
    patch.watermarkOpacity = clamp(input.watermarkOpacity, 0.1, 1)
  }
  if (typeof input.loudnorm === 'boolean') patch.loudnorm = input.loudnorm
  return updateSettings(patch)
}
