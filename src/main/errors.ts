import type { Result, UserError } from '@shared/types'

/** Erreur portant un message destiné à l'utilisateur (en français, avec une action proposée). */
export class AppError extends Error {
  constructor(
    readonly user: UserError,
    options?: { cause?: unknown }
  ) {
    super(user.message, options)
    this.name = 'AppError'
  }
}

function errnoCode(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null && 'code' in err
    ? String((err as { code: unknown }).code)
    : undefined
}

/** Convertit n'importe quelle erreur en message compréhensible par un non-développeur. */
export function toUserError(err: unknown): UserError {
  if (err instanceof AppError) return err.user
  switch (errnoCode(err)) {
    case 'ENOENT':
      return {
        message: 'Fichier ou dossier introuvable.',
        action: "Vérifie qu'il n'a pas été déplacé, renommé ou supprimé, puis réessaie."
      }
    case 'EACCES':
    case 'EPERM':
      return {
        message: "Windows refuse l'accès à ce fichier ou dossier.",
        action: "Ferme les programmes qui l'utilisent peut-être (OBS, lecteur vidéo) et réessaie."
      }
    case 'ENOSPC':
      return {
        message: 'Le disque est plein.',
        action: 'Libère de la place ou choisis un autre dossier de sortie, puis relance.'
      }
    case 'EBUSY':
      return {
        message: 'Ce fichier est en cours d’utilisation par un autre programme.',
        action: 'Attends la fin de l’enregistrement ou ferme le programme concerné, puis réessaie.'
      }
  }
  return {
    message: 'Une erreur inattendue est survenue.',
    action: 'Réessaie. Si le problème persiste, note ce qui s’est passé et signale-le.'
  }
}

export async function toResult<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (err) {
    console.error(err)
    return { ok: false, error: toUserError(err) }
  }
}
