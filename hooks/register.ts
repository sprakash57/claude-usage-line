import type { EngineInterface, PluginOptions, Register } from 'claude-code'
import { check, emptyAlerts } from './lib/alerts'
import { evaluateCache, evaluateLoaded } from './lib/extras'
import { emptyTrack, sample, turnsLeft } from './lib/forecast'
import { line, wallText } from './lib/format'
import { dayKey, keysFor, spendKey, staleKeys, sum } from './lib/ledger'
import { DEFAULTS, evaluate, type Config, type Readings } from './lib/verdict'

const REFRESH_MS = 60_000

const num = (v: unknown, fallback?: number) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN
  return Number.isFinite(n) ? n : fallback
}

export const readConfig = (o: PluginOptions): Config => ({
  amberPct: num(o.amberPct, DEFAULTS.amberPct)!,
  redPct: num(o.redPct, DEFAULTS.redPct)!,
  compactAmberPct: num(o.compactAmberPct, DEFAULTS.compactAmberPct)!,
  compactRedPct: num(o.compactRedPct, DEFAULTS.compactRedPct)!,
  dailyBudgetUsd: num(o.dailyBudgetUsd),
  alerts: o.alerts === 'off' || o.alerts === 'every' ? o.alerts : DEFAULTS.alerts,
  cacheTtlMin: num(o.cacheTtlMin, DEFAULTS.cacheTtlMin)!,
})

// what one load of the module remembers between draws; `register` starts it over
const fresh = (config: Config) => ({
  config,
  alerts: emptyAlerts(),
  fiveHour: emptyTrack(),
  compact: emptyTrack(),
  compactEpoch: 0,
  lastCompact: undefined as number | undefined,
  lastSpend: undefined as number | undefined,
  responses: 0,
  lastResponseAt: undefined as number | undefined,
  // while a turn runs the cache is being refreshed, so no countdown
  turnActive: false,
  warned: false,
  timer: undefined as { cancel: () => void } | undefined,
  // draws one at a time, so the timer and a turn never race on alert state
  queue: Promise.resolve(),
})

let s = fresh(DEFAULTS)

async function spentToday($: EngineInterface, startedAt: number, usd: number, now: number) {
  if (usd !== s.lastSpend) {
    await $.store.set(spendKey(dayKey(startedAt), await $.session.id()), usd)
    s.lastSpend = usd
  }
  const keys = keysFor(await $.store.keys(), dayKey(now))
  return sum(await Promise.all(keys.map(k => $.store.get(k))))
}

async function draw($: EngineInterface, turnEnded: boolean) {
  // `summary` estimates locally (no API calls) and gives the auto-compact window
  const usage = await $.session.usage({ breakdown: 'summary' })
  const now = await $.clock.now()
  const compactPct = usage.context.breakdown?.percentage
  const costUsd = usage.cost?.usd ?? 0
  const fivePct = usage.rateLimits.find(l => l.kind === 'five_hour')?.percentUsed

  if (compactPct !== undefined && s.lastCompact !== undefined && compactPct < s.lastCompact - 10) s.compactEpoch++
  s.lastCompact = compactPct ?? s.lastCompact
  if (turnEnded) {
    s.responses++
    s.lastResponseAt = now
    s.turnActive = false
    s.fiveHour = sample(s.fiveHour, fivePct)
    s.compact = sample(s.compact, compactPct)
  }

  const api = usage.rateLimits.length === 0 && costUsd > 0
  const readings: Readings = {
    now,
    compactPct,
    rateLimits: usage.rateLimits,
    costUsd,
    spentToday: api ? await spentToday($, usage.startedAt, costUsd, now) : 0,
  }
  const v = evaluate(readings, s.config)
  const w = v.wall
  const turns =
    w?.id === 'five_hour' ? turnsLeft(w.value, s.fiveHour) : w?.id === 'compact' ? turnsLeft(w.value, s.compact) : undefined
  const b = usage.context.breakdown
  const last = b?.apiUsage
  const idleMs = s.turnActive || s.lastResponseAt === undefined ? undefined : now - s.lastResponseAt
  const cache = evaluateCache(
    last && { read: last.cache_read_input_tokens, write: last.cache_creation_input_tokens, uncached: last.input_tokens },
    s.responses,
    idleMs,
    s.config.cacheTtlMin * 60_000,
  )
  const memoryTokens = b?.memoryFiles.reduce((a, m) => a + m.tokens, 0) ?? 0
  const loaded =
    b &&
    evaluateLoaded(b.skills?.totalSkills ?? 0, b.memoryFiles.length, (b.skills?.tokens ?? 0) + memoryTokens, b.rawMaxTokens)
  $.ui.status(line(v, now, turns, { cache, loaded }))

  const result = check(v.walls, v.wall, s.config.alerts, s.alerts, { day: dayKey(now), compactEpoch: s.compactEpoch })
  s.alerts = result.state
  for (const d of result.due) $.ui.toast(wallText(d, now), { timeoutMs: 8000 })
}

// a failed draw keeps the last line on screen and never reaches the session
function redraw($: EngineInterface, turnEnded: boolean) {
  s.queue = s.queue.then(() => draw($, turnEnded)).catch(err => {
    if (s.warned) return
    s.warned = true
    $.ui.log(`usage-line: draw failed: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
  })
  return s.queue
}

async function prune($: EngineInterface) {
  const keys = await $.store.keys()
  const now = await $.clock.now()
  await Promise.all(staleKeys(keys, now).map(k => $.store.delete(k)))
}

function tick($: EngineInterface) {
  void redraw($, false)
}

export const register: Register = (on, options) => {
  s.timer?.cancel()
  s = fresh(readConfig(options))

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    s.timer?.cancel()
    s.timer = $.clock.every(REFRESH_MS, () => tick($))
    await prune($).catch(() => {})
    await redraw($, false)
    return result
  })

  on('session.measure', async ($, e, next) => {
    await redraw($, false)
    return next(e)
  })

  // a subagent's turns run on its own cache and leave the session's as it was
  on('turn.start', async ($, e, next) => {
    if (e.agentId) return next(e)
    s.turnActive = true
    void redraw($, false)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    await redraw($, !e.agentId)
    return result
  })
}
