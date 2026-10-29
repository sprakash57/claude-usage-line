import { WINDOW_MS, elapsedPct, paceDelta } from './pace'

export type Level = 'unknown' | 'green' | 'amber' | 'red'
export type WallId = 'compact' | 'five_hour' | 'spend_limit' | 'daily' | 'seven_day'
export type Mode = 'unknown' | 'subscription' | 'api'

export type Config = {
  amberPct: number
  redPct: number
  compactAmberPct: number
  compactRedPct: number
  dailyBudgetUsd?: number
  alerts: 'off' | 'once' | 'every'
  cacheTtlMin: number
}

export const DEFAULTS: Config = {
  amberPct: 70,
  redPct: 90,
  compactAmberPct: 80,
  compactRedPct: 95,
  alerts: 'once',
  cacheTtlMin: 5,
}

export type Readings = {
  now: number
  compactPct?: number
  rateLimits: readonly { kind: string; percentUsed: number; resetsAt?: string }[]
  costUsd: number
  spentToday: number
}

export type Wall = {
  id: WallId
  level: Level
  value: number
  pace?: number
  resetsAt?: number
  budget?: number
}

export type Verdict = {
  level: Level
  mode: Mode
  spentToday: number
  budget?: number
  // the wall that set the light; absent while all are green
  wall?: Wall
  walls: Wall[]
}

const RANK: Record<Level, number> = { unknown: 0, green: 1, amber: 2, red: 3 }

// most urgent first: compaction lands within the turn, the week within days
const URGENCY: WallId[] = ['compact', 'five_hour', 'spend_limit', 'daily', 'seven_day']

export const worse = (a: Level, b: Level) => RANK[b] > RANK[a]

const level = (value: number, amber: number, red: number): Level =>
  value >= red ? 'red' : value >= amber ? 'amber' : 'green'

const parseTime = (iso: string | undefined) => {
  const ms = iso === undefined ? NaN : Date.parse(iso)
  return Number.isNaN(ms) ? undefined : ms
}

const rateWall = (l: Readings['rateLimits'][number], c: Config, now: number): Wall | undefined => {
  const id = l.kind as WallId
  if (id !== 'five_hour' && id !== 'seven_day' && id !== 'spend_limit') return undefined
  const resetsAt = parseTime(l.resetsAt)
  const windowMs = WINDOW_MS[id]
  const pace = resetsAt !== undefined && windowMs ? paceDelta(l.percentUsed, resetsAt, windowMs, now) : undefined
  let lv = level(l.percentUsed, c.amberPct, c.redPct)
  // a week isn't spent evenly (nights, weekends), so only the 5h pace may raise the light
  if (
    id === 'five_hour' && lv === 'green' && pace !== undefined && pace >= 20 &&
    elapsedPct(resetsAt!, windowMs!, now) >= 20
  ) lv = 'amber'
  return { id, level: lv, value: l.percentUsed, pace, resetsAt }
}

export const evaluate = (r: Readings, c: Config): Verdict => {
  const mode: Mode = r.rateLimits.length ? 'subscription' : r.costUsd > 0 ? 'api' : 'unknown'
  const walls: Wall[] = []

  if (r.compactPct !== undefined)
    walls.push({ id: 'compact', level: level(r.compactPct, c.compactAmberPct, c.compactRedPct), value: r.compactPct })
  for (const l of r.rateLimits) {
    const w = rateWall(l, c, r.now)
    if (w) walls.push(w)
  }
  const budget = mode === 'api' ? c.dailyBudgetUsd : undefined
  if (budget !== undefined && budget > 0) {
    const pct = (100 * r.spentToday) / budget
    walls.push({ id: 'daily', level: level(pct, 70, 90), value: r.spentToday, budget })
  }

  let wall: Wall | undefined
  for (const id of URGENCY)
    for (const w of walls)
      if (w.id === id && w.level !== 'green' && (!wall || worse(wall.level, w.level))) wall = w

  const lv: Level = wall ? wall.level : mode === 'unknown' ? 'unknown' : 'green'
  return { level: lv, mode, spentToday: r.spentToday, budget, wall, walls }
}
