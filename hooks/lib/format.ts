import type { Cache, Loaded } from './extras'
import type { Level, Verdict, Wall, WallId } from './verdict'

const DOT: Record<Level, string> = { unknown: '⚪', green: '🟢', amber: '🟡', red: '🔴' }
const LABEL: Record<WallId, string> = {
  compact: 'compact',
  five_hour: '5h',
  spend_limit: 'spend',
  daily: 'today',
  seven_day: 'wk',
}
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MINUTE = 60_000

const pct = (n: number | undefined) => (n === undefined ? '–' : `${Math.round(n)}%`)
const usd = (n: number) => `$${n.toFixed(2)}`
const pad = (n: number) => String(n).padStart(2, '0')
const clock = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

export const pace = (delta: number | undefined) => {
  if (delta === undefined) return ''
  const n = Math.round(Math.abs(delta))
  return n < 5 ? '' : ` ${delta > 0 ? '↑' : '↓'}${n}`
}

export const duration = (ms: number) => {
  const m = Math.max(0, Math.ceil(ms / MINUTE))
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${pad(m % 60)}m`
}

export const resets = (at: number | undefined, now: number) => {
  if (at === undefined) return ''
  const d = new Date(at)
  return at - now < 24 * 60 * MINUTE
    ? ` · resets ${clock(d)} (${duration(at - now)})`
    : ` · resets ${DAYS[d.getDay()]} ${clock(d)}`
}

// one wall as the line names it: `5h 94% ↑12 · resets 14:30 (47m)`
export const wallText = (w: Wall, now: number) =>
  w.id === 'daily'
    ? `${usd(w.value)} / $${w.budget} today`
    : `${LABEL[w.id]} ${pct(w.value)}${pace(w.pace)}${resets(w.resetsAt, now)}`

// a fixed order, so each number is always in the same place
const ORDER: WallId[] = ['five_hour', 'seven_day', 'spend_limit', 'compact', 'daily']

// one number with its own light; the named wall alone adds its reset and forecast
const item = (w: Wall, now: number, named: boolean, turns?: number) => {
  const body = w.id === 'daily' ? `${usd(w.value)}/$${w.budget}` : `${LABEL[w.id]} ${pct(w.value)}${pace(w.pace)}`
  const extra = named ? `${resets(w.resetsAt, now)}${turns === undefined ? '' : ` · ~${turns} turns`}` : ''
  return `${DOT[w.level]} ${body}${extra}`
}

// `🟢 cache 94% 4m`: hit rate, then how long it stays warm
export const cacheText = (c: Cache) => {
  if (c.hitPct === undefined) return `${DOT.unknown} cache –`
  const warm = c.warmMs === undefined ? '' : c.warmMs > 0 ? ` ${duration(c.warmMs)}` : ' cold'
  return `${DOT[c.level]} cache ${pct(c.hitPct)}${warm}`
}

export const loadedText = (l: Loaded) =>
  `${l.level ? `${DOT[l.level]} ` : ''}${l.skills} skills · ${l.memory} mem`

export type Extras = { cache?: Cache; loaded?: Loaded }

export const line = (v: Verdict, now: number, turns?: number, extras: Extras = {}) => {
  const parts: string[] = []
  if (v.mode === 'unknown') parts.push(`${DOT.unknown} 5h –`, `${DOT.unknown} wk –`)
  for (const id of ORDER) {
    const w = v.walls.find(x => x.id === id)
    if (w) parts.push(item(w, now, w === v.wall, turns))
    else if (id === 'compact') parts.push(`${DOT.unknown} ${LABEL.compact} –`)
  }
  // spend with no budget has nothing to judge it by, so no light
  if (v.mode === 'api' && !v.budget) parts.push(`${usd(v.spentToday)} today`)
  if (extras.cache) parts.push(cacheText(extras.cache))
  if (extras.loaded) parts.push(loadedText(extras.loaded))
  return parts.join(' · ')
}
