import type { Level, Mode } from './verdict'

// The last response's input side, as the prompt cache split it
export type CacheReading = { read: number; write: number; uncached: number }

export type Cache = {
  level: Level
  hitPct?: number
  // time the cache stays warm; absent while a turn runs or before any response
  warmMs?: number
}

export type Loaded = { skills: number; memory: number; level?: Level }

export const LOADED_AMBER_SHARE = 0.1

// a session's first turn writes its new conversation to the cache, so it reads as a
// poor hit rate however healthy the cache is: judge from the second turn
export const evaluateCache = (
  r: CacheReading | null | undefined,
  responses: number,
  idleMs: number | undefined,
  ttlMs: number,
): Cache => {
  const total = r ? r.read + r.write + r.uncached : 0
  if (!r || total <= 0 || responses < 2) return { level: 'unknown' }
  const hitPct = (100 * r.read) / total
  const warmMs = idleMs === undefined ? undefined : ttlMs - idleMs
  let level: Level = hitPct >= 80 ? 'green' : hitPct >= 50 ? 'amber' : 'red'
  // a cold cache bills the next turn at full price
  if (warmMs !== undefined && warmMs <= 0 && level === 'green') level = 'amber'
  return { level, hitPct, warmMs }
}

// skills and memory have no limit; they only matter once they crowd the context
export const evaluateLoaded = (skills: number, memory: number, tokens: number, window: number): Loaded => ({
  skills,
  memory,
  level: window > 0 && tokens > LOADED_AMBER_SHARE * window ? 'amber' : undefined,
})

const MIN = 60_000
const parseTtl = (v: unknown) => (v === '1h' ? 60 * MIN : v === '5m' ? 5 * MIN : undefined)

// how long the main conversation's cache lives, picked as Claude Code picks it:
// CLAUDE_CODE_PROMPT_CACHE_TTL, then the promptCacheTtl setting, then 1 hour on a
// subscription within its limits and 5 minutes otherwise; `overrideMin` beats all
export const cacheTtlMs = (o: {
  overrideMin?: number
  env?: string
  setting?: unknown
  mode: Mode
  overLimit: boolean
}) => {
  if (o.overrideMin !== undefined && o.overrideMin > 0) return o.overrideMin * MIN
  return parseTtl(o.env) ?? parseTtl(o.setting) ?? (o.mode === 'subscription' && !o.overLimit ? 60 * MIN : 5 * MIN)
}
