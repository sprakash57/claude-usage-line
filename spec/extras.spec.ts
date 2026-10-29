import { describe, expect, test } from 'bun:test'
import { cacheTtlMs, evaluateCache, evaluateLoaded } from '../hooks/lib/extras'
import { cacheText, loadedText } from '../hooks/lib/format'

const TTL = 5 * 60_000
const reading = (read: number, write = 0, uncached = 0) => ({ read, write, uncached })

describe('cache', () => {
  test('no light during the first turn: the cache is still filling', () => {
    expect(evaluateCache(reading(4_100, 5_900), 0, undefined, TTL).level).toBe('unknown')
  })

  test('no light after the first turn either: it is still writing the conversation', () => {
    expect(evaluateCache(reading(0, 10_000), 1, 0, TTL).level).toBe('unknown')
    // a real first turn, live: system prompt read, the new conversation written
    expect(evaluateCache(reading(4_100, 5_900), 1, 0, TTL).level).toBe('unknown')
    // from the second turn, nothing read is a real miss
    expect(evaluateCache(reading(0, 10_000), 2, 0, TTL).level).toBe('red')
    expect(evaluateCache(null, 5, 0, TTL).level).toBe('unknown')
    expect(cacheText(evaluateCache(null, 5, 0, TTL))).toBe('⚪ cache –')
  })

  test('hit rate thresholds', () => {
    expect(evaluateCache(reading(80, 10, 10), 2, 0, TTL).level).toBe('green')
    expect(evaluateCache(reading(79, 11, 10), 2, 0, TTL).level).toBe('amber')
    expect(evaluateCache(reading(49, 41, 10), 2, 0, TTL).level).toBe('red')
  })

  test('counts down while idle, and a cold cache is at least amber', () => {
    expect(cacheText(evaluateCache(reading(94, 6), 3, 60_000, TTL))).toBe('🟢 cache 94% 4m')
    expect(cacheText(evaluateCache(reading(94, 6), 3, TTL, TTL))).toBe('🟡 cache 94% cold')
    // already red stays red
    expect(evaluateCache(reading(20, 80), 3, TTL + 1, TTL).level).toBe('red')
  })

  test('no countdown while a turn runs', () => {
    expect(cacheText(evaluateCache(reading(94, 6), 3, undefined, TTL))).toBe('🟢 cache 94%')
  })
})

describe('skills and memory', () => {
  test('no light until they take more than 10% of the context', () => {
    expect(loadedText(evaluateLoaded(72, 2, 19_000, 200_000))).toBe('72 skills · 2 mem')
    expect(loadedText(evaluateLoaded(72, 2, 21_000, 200_000))).toBe('🟡 72 skills · 2 mem')
  })
})

describe('cache lifetime', () => {
  const MIN = 60_000
  const sub = { mode: 'subscription' as const, overLimit: false }

  test('follows the plan when nothing is set', () => {
    expect(cacheTtlMs(sub)).toBe(60 * MIN)
    expect(cacheTtlMs({ mode: 'api', overLimit: false })).toBe(5 * MIN)
    // past its usage limits a subscription is billed as extra usage, on the 5-minute cache
    expect(cacheTtlMs({ ...sub, overLimit: true })).toBe(5 * MIN)
  })

  test("Claude Code's own setting, then its env var, win over the plan", () => {
    expect(cacheTtlMs({ ...sub, setting: '5m' })).toBe(5 * MIN)
    expect(cacheTtlMs({ ...sub, setting: '5m', env: '1h' })).toBe(60 * MIN)
    expect(cacheTtlMs({ ...sub, setting: 'junk' })).toBe(60 * MIN)
  })

  test('the mod setting overrides everything', () => {
    expect(cacheTtlMs({ ...sub, env: '1h', overrideMin: 10 })).toBe(10 * MIN)
    expect(cacheTtlMs({ ...sub, overrideMin: 0 })).toBe(60 * MIN)
  })
})
