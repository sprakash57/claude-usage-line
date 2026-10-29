import type { Level } from './verdict'

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

// the first turn is still filling the cache, so it is judged once that turn is back;
// after it, a turn that read nothing is judged too only from the second (a cold start)
export const evaluateCache = (
  r: CacheReading | null | undefined,
  responses: number,
  idleMs: number | undefined,
  ttlMs: number,
): Cache => {
  const total = r ? r.read + r.write + r.uncached : 0
  if (!r || total <= 0 || responses < 1 || (r.read === 0 && responses < 2)) return { level: 'unknown' }
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
