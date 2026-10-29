import { describe, expect, test } from 'bun:test'
import { HOUR } from '../hooks/lib/pace'
import { DEFAULTS, evaluate, type Readings } from '../hooks/lib/verdict'

const now = new Date(2026, 9, 28, 12, 0).getTime()
const iso = (ms: number) => new Date(ms).toISOString()
// a 5h window with `hoursLeft` to go
const five = (percentUsed: number, hoursLeft = 4) => ({ kind: 'five_hour', percentUsed, resetsAt: iso(now + hoursLeft * HOUR) })
const week = (percentUsed: number, hoursLeft = 6 * 24) => ({ kind: 'seven_day', percentUsed, resetsAt: iso(now + hoursLeft * HOUR) })

const read = (r: Partial<Readings>): Readings => ({ now, rateLimits: [], costUsd: 0, spentToday: 0, compactPct: 10, ...r })

describe('verdict', () => {
  test('AC8: unknown before any response, never green', () => {
    const v = evaluate(read({}), DEFAULTS)
    expect(v.level).toBe('unknown')
    expect(v.mode).toBe('unknown')
  })

  test('AC8: a hot compaction wall still shows before the first response', () => {
    expect(evaluate(read({ compactPct: 85 }), DEFAULTS).level).toBe('amber')
  })

  test('AC2: rate-limit thresholds', () => {
    expect(evaluate(read({ rateLimits: [five(10)] }), DEFAULTS).level).toBe('green')
    expect(evaluate(read({ rateLimits: [five(70)] }), DEFAULTS).level).toBe('amber')
    expect(evaluate(read({ rateLimits: [five(90)] }), DEFAULTS).level).toBe('red')
    expect(evaluate(read({ rateLimits: [{ kind: 'spend_limit', percentUsed: 104 }] }), DEFAULTS).level).toBe('red')
  })

  test('AC3: 5h pace ≥ +20 past 20% of the window turns amber', () => {
    // 2h of 5h gone = 40% elapsed, 62% used = +22
    const v = evaluate(read({ rateLimits: [five(62, 3)] }), DEFAULTS)
    expect(v.level).toBe('amber')
    expect(v.wall?.id).toBe('five_hour')
  })

  test('AC3: no pace amber in the first 20% of the window', () => {
    // 30m gone = 10% elapsed, 35% used = +25
    expect(evaluate(read({ rateLimits: [five(35, 4.5)] }), DEFAULTS).level).toBe('green')
  })

  test('AC4: weekly pace alone never colors', () => {
    // a day in, 40% used: +26 ahead of an even spread
    const v = evaluate(read({ rateLimits: [week(40, 6 * 24)] }), DEFAULTS)
    expect(v.level).toBe('green')
    expect(v.walls.find(w => w.id === 'seven_day')?.pace).toBeGreaterThan(20)
    // three days in (past the 20% that gates the 5h rule), 65% used: +22
    expect(evaluate(read({ rateLimits: [week(65, 4 * 24)] }), DEFAULTS).level).toBe('green')
  })

  test('AC4: weekly replay — a workday pattern never turns amber on pace alone', () => {
    // a 7-day window starting Monday 00:00; 9 to 18 each weekday burns 1.4 points an hour
    const start = new Date(2026, 9, 26, 0, 0).getTime()
    const resetsAt = iso(start + 7 * 24 * HOUR)
    let used = 0
    for (let h = 0; h < 7 * 24; h++) {
      const day = Math.floor(h / 24), hour = h % 24
      if (day < 5 && hour >= 9 && hour < 18) used += 1.4
      const v = evaluate(read({ now: start + h * HOUR, rateLimits: [{ kind: 'seven_day', percentUsed: used, resetsAt }] }), DEFAULTS)
      if (used < DEFAULTS.amberPct) expect(v.level).toBe('green')
    }
  })

  test('AC5: compaction thresholds', () => {
    expect(evaluate(read({ compactPct: 80, rateLimits: [five(1)] }), DEFAULTS).level).toBe('amber')
    expect(evaluate(read({ compactPct: 95, rateLimits: [five(1)] }), DEFAULTS).level).toBe('red')
  })

  test('AC6: daily budget wall only in API mode with a budget', () => {
    const c = { ...DEFAULTS, dailyBudgetUsd: 10 }
    expect(evaluate(read({ costUsd: 2, spentToday: 7.4 }), c).level).toBe('amber')
    expect(evaluate(read({ costUsd: 2, spentToday: 9 }), c).level).toBe('red')
    expect(evaluate(read({ costUsd: 2, spentToday: 9 }), DEFAULTS).level).toBe('green')
    // a subscription session's cost estimate is not spend
    expect(evaluate(read({ costUsd: 2, spentToday: 9, rateLimits: [five(1)] }), c).level).toBe('green')
  })

  test('AC7: worst level wins, ties go to the most urgent wall', () => {
    const v = evaluate(read({ compactPct: 85, rateLimits: [five(75), week(95)] }), DEFAULTS)
    expect(v.wall?.id).toBe('seven_day')
    const tie = evaluate(read({ compactPct: 85, rateLimits: [five(75), week(75)] }), DEFAULTS)
    expect(tie.wall?.id).toBe('compact')
  })

  test('AC15: API mode is a response with no rate limits', () => {
    expect(evaluate(read({ costUsd: 0.01 }), DEFAULTS).mode).toBe('api')
    expect(evaluate(read({ costUsd: 0.01, rateLimits: [five(1)] }), DEFAULTS).mode).toBe('subscription')
  })

  test('thresholds come from config', () => {
    expect(evaluate(read({ rateLimits: [five(50)] }), { ...DEFAULTS, amberPct: 40 }).level).toBe('amber')
  })

  test('a missing or bad resetsAt drops pace, not the wall', () => {
    const v = evaluate(read({ rateLimits: [{ kind: 'five_hour', percentUsed: 92, resetsAt: 'nope' }] }), DEFAULTS)
    expect(v.level).toBe('red')
    expect(v.wall?.pace).toBeUndefined()
  })
})
