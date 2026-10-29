import { describe, expect, test } from 'bun:test'
import { check, emptyAlerts, type AlertState, type Windows } from '../hooks/lib/alerts'
import type { Level, Wall } from '../hooks/lib/verdict'

const win: Windows = { day: '2026-10-28', compactEpoch: 0 }
const five = (level: Level, resetsAt = 1_800_000_000_000): Wall => ({ id: 'five_hour', level, value: 0, resetsAt })
const comp = (level: Level): Wall => ({ id: 'compact', level, value: 0 })

const run = (mode: 'off' | 'once' | 'every', steps: Wall[][], w = win) => {
  let state: AlertState = emptyAlerts()
  return steps.map(walls => {
    // as the verdict names it: the first wall that isn't green
    const r = check(walls, walls.find(x => x.level !== 'green'), mode, state, w)
    state = r.state
    return r.due.map(d => `${d.id}:${d.level}`)
  })
}

describe('alerts (AC19)', () => {
  test('off never toasts', () => {
    expect(run('off', [[five('red')]])).toEqual([[]])
  })

  test('once: one toast per wall, window and level', () => {
    expect(run('once', [[five('amber')], [five('amber')], [five('green')], [five('amber')], [five('red')], [five('red')]]))
      .toEqual([['five_hour:amber'], [], [], [], ['five_hour:red'], []])
  })

  test('once: falling back from red to amber is quiet', () => {
    expect(run('once', [[five('red')], [five('amber')]])).toEqual([['five_hour:red'], []])
  })

  test('once: a new window may toast again; small jitter in resetsAt does not', () => {
    expect(run('once', [[five('amber', 1_800_000_000_000)], [five('amber', 1_800_000_030_000)], [five('amber', 1_800_018_000_000)]]))
      .toEqual([['five_hour:amber'], [], ['five_hour:amber']])
  })

  test('once: a compaction starts a new compact window', () => {
    const state = check([comp('amber')], comp('amber'), 'once', emptyAlerts(), win).state
    expect(check([comp('amber')], comp('amber'), 'once', state, win).due).toEqual([])
    expect(check([comp('amber')], comp('amber'), 'once', state, { ...win, compactEpoch: 1 }).due).toHaveLength(1)
  })

  test('every: each upward change toasts', () => {
    expect(run('every', [[five('amber')], [five('amber')], [five('green')], [five('amber')], [five('red')]]))
      .toEqual([['five_hour:amber'], [], [], ['five_hour:amber'], ['five_hour:red']])
  })

  test('limits crossing together make one toast, for the one the line names', () => {
    const week: Wall = { id: 'seven_day', level: 'amber', value: 0, resetsAt: 1_800_000_000_000 }
    const r = check([five('amber'), week], five('amber'), 'once', emptyAlerts(), win)
    expect(r.due.map(d => d.id)).toEqual(['five_hour'])
    // later the week is the one named: it was never toasted, so now it is
    expect(check([five('green'), week], week, 'once', r.state, win).due.map(d => d.id)).toEqual(['seven_day'])
  })

  test('every: a wall that is not named still has its level remembered', () => {
    const week = (level: Level): Wall => ({ id: 'seven_day', level, value: 0 })
    const r = check([five('red'), week('amber')], five('red'), 'every', emptyAlerts(), win)
    expect(r.due.map(d => d.id)).toEqual(['five_hour'])
    expect(r.state.levels.seven_day).toBe('amber')
  })
})
