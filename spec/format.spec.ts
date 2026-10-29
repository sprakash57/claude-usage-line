import { describe, expect, test } from 'bun:test'
import { duration, line, pace, resets } from '../hooks/lib/format'
import { HOUR } from '../hooks/lib/pace'
import { DEFAULTS, evaluate, type Readings } from '../hooks/lib/verdict'

const now = new Date(2026, 9, 28, 13, 43).getTime() // a Wednesday
const at = (h: number, m = 0, day = 28) => new Date(2026, 9, day, h, m).getTime()
const iso = (ms: number) => new Date(ms).toISOString()
const read = (r: Partial<Readings>): Readings => ({ now, rateLimits: [], costUsd: 0, spentToday: 0, compactPct: 6, ...r })
const show = (r: Partial<Readings>, c = DEFAULTS, turns?: number) => line(evaluate(read(r), c), now, turns)

// 5h at 5% with 3h17m to go: 34% elapsed, so 29 behind; the week at 11%, 4 days to go: 32 behind
const five = (percentUsed = 5, resetsAt = at(17)) => ({ kind: 'five_hour', percentUsed, resetsAt: iso(resetsAt) })
const week = (percentUsed = 11, resetsAt = at(13, 43, 32)) => ({ kind: 'seven_day', percentUsed, resetsAt: iso(resetsAt) })

describe('line', () => {
  test('every number has its own light, in a fixed order', () => {
    expect(show({ rateLimits: [five(), week()] })).toBe('🟢 5h 5% ↓29 · 🟢 wk 11% ↓32 · 🟢 compact 6%')
    // order holds whatever order the readings come in
    expect(show({ rateLimits: [week(), five()] })).toBe('🟢 5h 5% ↓29 · 🟢 wk 11% ↓32 · 🟢 compact 6%')
  })

  test('unknown before the first response', () => {
    expect(show({})).toBe('⚪ 5h – · ⚪ wk – · 🟢 compact 6%')
    expect(show({ compactPct: undefined })).toBe('⚪ 5h – · ⚪ wk – · ⚪ compact –')
  })

  test('only the named wall carries its reset time', () => {
    // 47m of 300m left: 84% elapsed, 94% used, so 10 points ahead
    const v = show({ rateLimits: [five(94, at(14, 30)), week(75)] })
    expect(v).toBe('🔴 5h 94% ↑10 · resets 14:30 (47m) · 🟡 wk 75% ↑32 · 🟢 compact 6%')
  })

  test('a weekly reset more than a day away shows the weekday', () => {
    expect(show({ rateLimits: [five(), week(78, at(9, 0, 31))] })).toMatch(/· 🟡 wk 78% ↑\d+ · resets Sat 09:00 · 🟢 compact 6%$/)
    expect(show({ rateLimits: [five(), week(78, at(9, 0, 29))] })).toMatch(/· 🟡 wk 78% ↓\d+ · resets 09:00 \(19h17m\) · /)
  })

  test('reset left out when unknown', () => {
    expect(show({ rateLimits: [{ kind: 'five_hour', percentUsed: 91 }] })).toBe('🔴 5h 91% · 🟢 compact 6%')
  })

  test('forecast hint follows the named wall', () => {
    expect(show({ compactPct: 96, rateLimits: [five(), week()] }, DEFAULTS, 3))
      .toBe('🟢 5h 5% ↓29 · 🟢 wk 11% ↓32 · 🔴 compact 96% · ~3 turns')
  })

  test('API: spend with no budget has no light', () => {
    expect(show({ costUsd: 1, spentToday: 3.1 })).toBe('🟢 compact 6% · $3.10 today')
  })

  test('API: spend against a budget has its light', () => {
    const c = { ...DEFAULTS, dailyBudgetUsd: 10 }
    expect(show({ costUsd: 1, spentToday: 3.1 }, c)).toBe('🟢 compact 6% · 🟢 $3.10/$10')
    expect(show({ costUsd: 1, spentToday: 7.4 }, c)).toBe('🟢 compact 6% · 🟡 $7.40/$10')
  })

  test('worst case stays within 90 characters', () => {
    const r = [five(99, now + 4 * HOUR), week(99, now + 23 * HOUR), { kind: 'spend_limit', percentUsed: 100, resetsAt: iso(now + 23 * HOUR) }]
    const l = show({ rateLimits: r, compactPct: 99 }, DEFAULTS, 999)
    expect([...l].length).toBeLessThanOrEqual(90)
  })
})

describe('parts', () => {
  test('pace arrow only from 5 points', () => {
    expect(pace(4.4)).toBe('')
    expect(pace(5)).toBe(' ↑5')
    expect(pace(-12.2)).toBe(' ↓12')
    expect(pace(undefined)).toBe('')
  })

  test('duration', () => {
    expect(duration(47 * 60_000)).toBe('47m')
    expect(duration(125 * 60_000)).toBe('2h05m')
    expect(duration(-5)).toBe('0m')
  })

  test('resets', () => {
    expect(resets(undefined, now)).toBe('')
    expect(resets(at(15, 0), now)).toBe(' · resets 15:00 (1h17m)')
  })
})
