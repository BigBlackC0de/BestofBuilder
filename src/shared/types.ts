/** Extensions de fichiers vidéo acceptées (en minuscules, avec le point). */
export const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.mov', '.webm'] as const

/** Schéma du protocole interne utilisé pour afficher miniatures et vidéos locales. */
export const MEDIA_SCHEME = 'bob-media'

/** Réglages persistés entre deux lancements. */
export interface Settings {
  lastFolder: string | null
  /** Dossier où sont écrits les best-of (null : dossier Vidéos de Windows). */
  outputFolder: string | null
  presetId: PresetId
  transition: TransitionKind
  /** Durée des transitions (s), de 0,3 à 1. */
  transitionDuration: number
  introPath: string | null
  outroPath: string | null
  watermarkPath: string | null
  /** Largeur du filigrane, en fraction de la largeur de la vidéo (0,05 à 0,3). */
  watermarkSize: number
  /** Opacité du filigrane (0,1 à 1). */
  watermarkOpacity: number
  /** Normalisation du volume à -14 LUFS (standard YouTube). */
  loudnorm: boolean
}

export type TransitionKind = 'fade' | 'tvsnow' | 'pixelize' | 'hblur' | 'slideleft' | 'none'

export const TRANSITIONS: readonly { id: TransitionKind; label: string }[] = [
  { id: 'fade', label: 'Fondu' },
  { id: 'tvsnow', label: 'Neige TV (avec souffle)' },
  { id: 'pixelize', label: 'Pixelisation' },
  { id: 'hblur', label: 'Flou horizontal' },
  { id: 'slideleft', label: 'Glissement vers la gauche' },
  { id: 'none', label: 'Aucune (coupe franche)' }
]

export const TRANSITION_MIN = 0.3
export const TRANSITION_MAX = 1
export const WATERMARK_SIZE_MIN = 0.05
export const WATERMARK_SIZE_MAX = 0.3

/** Réglages modifiables directement depuis l'interface (les chemins passent par un sélecteur). */
export type EditableSettings = Pick<
  Settings,
  'transition' | 'transitionDuration' | 'watermarkSize' | 'watermarkOpacity' | 'loudnorm'
>

/** Fichiers d'habillage choisis dans les réglages. */
export type AssetKind = 'intro' | 'outro' | 'watermark'

export interface AssetInfo {
  fileName: string
  /** Durée pour une vidéo (intro/outro), null pour une image. */
  durationSec: number | null
  /** Aperçu (miniature ou image) via le protocole interne. */
  previewUrl: string | null
  /** Message si le fichier est introuvable ou illisible. */
  problem: string | null
}

/** Réglages tels que vus par l'interface. */
export interface SettingsView extends Settings {
  /** Dossier de sortie effectif (dossier Vidéos si non choisi). */
  outputFolder: string
  assets: Record<AssetKind, AssetInfo | null>
}

/** Préréglages de rendu proposés. */
export type PresetId = 'yt1080p60' | 'yt1080p30' | 'draft'

export interface Preset {
  id: PresetId
  label: string
  fps: number
  /** Brouillon : encodage plus rapide, qualité moindre. */
  draft: boolean
}

export const PRESETS: readonly Preset[] = [
  { id: 'yt1080p60', label: 'YouTube 1080p60', fps: 60, draft: false },
  { id: 'yt1080p30', label: 'YouTube 1080p30', fps: 30, draft: false },
  { id: 'draft', label: 'Rapide (brouillon)', fps: 30, draft: true }
]

export const DEFAULT_PRESET: PresetId = 'yt1080p60'

/** Clip trouvé dans le dossier, avant analyse. */
export interface ClipEntry {
  /** Identifiant opaque : le renderer ne manipule jamais les chemins pour accéder aux fichiers. */
  id: string
  fileName: string
  sizeBytes: number
  /** Date de création du fichier (ms depuis epoch). */
  createdAt: number
}

/** Résultat de l'analyse ffprobe d'un clip. */
export interface ClipInfo {
  durationSec: number
  width: number
  height: number
  fps: number
  videoCodec: string
  audioCodec: string | null
  hasAudio: boolean
  /** URL de la miniature (protocole interne), ou null si elle n'a pas pu être générée. */
  thumbnailUrl: string | null
}

export interface ScanResult {
  folder: string
  clips: ClipEntry[]
}

export interface AppInfo {
  version: string
  ffmpegVersion: string | null
  ffprobeVersion: string | null
  /** Encodeur vidéo utilisé pour le rendu : NVENC (carte graphique) ou x264 (processeur). */
  encoder: 'h264_nvenc' | 'libx264' | null
}

/** Découpe et titre d'un clip, choisis dans l'éditeur. */
export interface ClipEdit {
  /** Point d'entrée (s). */
  inSec: number
  /** Point de sortie (s), null = fin du clip. */
  outSec: number | null
  /** Titre court (chapitres, bandeau). Vide = nom du fichier. */
  title: string
}

export interface RenderItem extends ClipEdit {
  clipId: string
}

/** Ce que l'interface demande de rendre. */
export interface RenderJob {
  /** Clips à assembler, dans l'ordre, avec leur découpe. */
  items: RenderItem[]
  presetId: PresetId
  /** Nom du fichier de sortie (sans dossier). */
  fileName: string
}

export interface RenderProgress {
  /** 0 à 1. */
  ratio: number
  /** Libellé de l'étape en cours, ex. « Normalisation 3/12 ». */
  step: string
  /** Secondes restantes estimées, null tant qu'on ne peut pas estimer. */
  etaSec: number | null
}

export interface RenderOutcome {
  outputPath: string
  durationSec: number
  elapsedSec: number
  logPath: string
  /** Chapitres au format de la description YouTube. */
  chapters: string
  /** Avertissement si YouTube risque d'ignorer les chapitres. */
  chapterWarning: string | null
}

/** Échec ou annulation d'un rendu : on garde le journal pour pouvoir le consulter. */
export interface RenderFailure extends UserError {
  cancelled: boolean
  logPath: string | null
}

/** Erreur présentable à l'utilisateur : un message clair et une action proposée. */
export interface UserError {
  message: string
  action?: string
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: UserError }
