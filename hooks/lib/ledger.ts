// Daily spend lives in the store as one key per session, `spend:<day>:<session>`,
// so concurrent sessions never overwrite each other's figures.
const PREFIX = 'spend:'
const KEEP_DAYS = 7

const pad = (n: number) => String(n).padStart(2, '0')

// local calendar day
export const dayKey = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const spendKey = (day: string, session: string) => `${PREFIX}${day}:${session}`

export const dayOf = (key: string) => (key.startsWith(PREFIX) ? key.slice(PREFIX.length, PREFIX.length + 10) : undefined)

export const keysFor = (keys: readonly string[], day: string) => keys.filter(k => dayOf(k) === day)

export const staleKeys = (keys: readonly string[], now: number) => {
  const oldest = dayKey(now - KEEP_DAYS * 24 * 3_600_000)
  return keys.filter(k => {
    const day = dayOf(k)
    return day !== undefined && day < oldest
  })
}

export const sum = (values: readonly unknown[]) =>
  values.reduce<number>((a, v) => a + (typeof v === 'number' && Number.isFinite(v) ? v : 0), 0)
