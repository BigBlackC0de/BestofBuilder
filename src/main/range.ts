/** Parse un en-tête HTTP « Range: bytes=a-b ». Renvoie null si absent ou invalide. */
export function parseRange(
  header: string | null,
  size: number
): { start: number; end: number } | null {
  const m = header ? /^bytes=(\d*)-(\d*)$/.exec(header.trim()) : null
  if (!m) return null
  const [, a = '', b = ''] = m
  let start: number
  let end: number
  if (a === '') {
    // « bytes=-N » : les N derniers octets.
    const n = Number(b)
    if (!b || n === 0) return null
    start = Math.max(0, size - n)
    end = size - 1
  } else {
    start = Number(a)
    end = b === '' ? size - 1 : Math.min(Number(b), size - 1)
  }
  return start <= end && start < size ? { start, end } : null
}
