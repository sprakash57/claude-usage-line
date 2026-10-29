import { describe, expect, test } from 'bun:test'
import { dayKey, keysFor, spendKey, staleKeys, sum } from '../hooks/lib/ledger'

const now = new Date(2026, 9, 28, 9, 0).getTime()

describe('ledger (AC16)', () => {
  test('local day key', () => {
    expect(dayKey(now)).toBe('2026-10-28')
    expect(dayKey(new Date(2026, 0, 5, 23, 59).getTime())).toBe('2026-01-05')
  })

  test("each session has its own key, and today's are summed", () => {
    const keys = [spendKey('2026-10-28', 'a'), spendKey('2026-10-28', 'b'), spendKey('2026-10-27', 'c'), 'other']
    expect(keysFor(keys, '2026-10-28')).toEqual(['spend:2026-10-28:a', 'spend:2026-10-28:b'])
    expect(sum([1.5, 2.25, 'junk', undefined, NaN])).toBe(3.75)
  })

  test('keys older than 7 days are stale', () => {
    const keys = [spendKey('2026-10-20', 'a'), spendKey('2026-10-21', 'b'), spendKey('2026-10-28', 'c'), 'other']
    expect(staleKeys(keys, now)).toEqual(['spend:2026-10-20:a'])
  })
})
