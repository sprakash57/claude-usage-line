import { expect, mock, test } from 'claude-code/testing'
import type { On, SessionUsage } from 'claude-code'

const NOW = new Date(2026, 9, 28, 13, 43).getTime()
const MIN = 60_000

// stands for the engine: the usage figures, the status line and toasts
const engine = (on: On, usage: () => Partial<SessionUsage>) => {
  const lines: (string | undefined)[] = []
  const toasts: string[] = []
  on('session.usage', () => ({
    value: { startedAt: NOW, context: { percent: 22 } as SessionUsage['context'], rateLimits: [], cost: { usd: 0 }, ...usage() },
  }))
  on('session.id', () => ({ value: 'sess-1' }))
  on('ui.status', (_, e) => {
    lines.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  return { lines, toasts }
}

const start = { cwd: '/', surface: 'terminal', isInteractive: true } as const

test('before any response the light is unknown', async ($, on) => {
  mock.clock(on, { now: NOW })
  mock.store(on)
  const { lines, toasts } = engine(on, () => ({}))
  await $.session.start(start)
  expect(lines.at(-1)).toBe('⚪ 5h – · ⚪ wk – · ⚪ compact – · ⚪ cache –')
  expect(toasts).toEqual([])
})

test('a red 5h names the limit, counts down each minute, and toasts once', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  mock.store(on)
  const resetsAt = new Date(NOW + 47 * MIN).toISOString()
  const { lines, toasts } = engine(on, () => ({ rateLimits: [{ kind: 'five_hour', percentUsed: 94, resetsAt }] }))
  await $.session.start(start)
  expect(lines.at(-1)).toBe('🔴 5h 94% ↑10 · resets 14:30 (47m) · ⚪ compact – · ⚪ cache –')

  await clock.advance(MIN)
  expect(lines.at(-1)).toContain('(46m)')
  expect(toasts).toHaveLength(1)
  expect(toasts[0]).toStartWith('5h 94%')
})

test('API sessions add up today across sessions in the store', async ($, on) => {
  mock.clock(on, { now: NOW })
  const store = new Map<string, unknown>([['spend:2026-10-28:other', 4], ['spend:2026-10-01:old', 99]])
  on('store.keys', () => ({ value: [...store.keys()] }))
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => (store.set(e.key, e.value), { value: undefined }))
  on('store.delete', (_, e) => (store.delete(e.key), { value: undefined }))
  const { lines } = engine(on, () => ({ cost: { usd: 3.4 } }))
  await $.session.start(start)
  expect(lines.at(-1)).toBe('⚪ compact – · $7.40 today · ⚪ cache –')
  // this session wrote only its own entry, and the month-old one was pruned
  expect(Object.fromEntries(store)).toEqual({ 'spend:2026-10-28:other': 4, 'spend:2026-10-28:sess-1': 3.4 })
})

test('a budget from config turns the light amber', { options: { dailyBudgetUsd: 10 } }, async ($, on) => {
  mock.clock(on, { now: NOW })
  mock.store(on, { 'spend:2026-10-28:other': 4 })
  const { lines } = engine(on, () => ({ cost: { usd: 3.4 } }))
  await $.session.start(start)
  expect(lines.at(-1)).toBe('⚪ compact – · 🟡 $7.40/$10 · ⚪ cache –')
})

test('a failing reading keeps the last line and does not throw', async ($, on) => {
  mock.clock(on, { now: NOW })
  mock.store(on)
  let fail = false
  const { lines } = engine(on, () => {
    if (fail) throw new Error('boom')
    return {}
  })
  await $.session.start(start)
  fail = true
  await $.session.start(start)
  expect(lines.at(-1)).toBe('⚪ 5h – · ⚪ wk – · ⚪ compact – · ⚪ cache –')
})

test('two limits crossing together make one toast', { options: { amberPct: 10 } }, async ($, on) => {
  mock.clock(on, { now: NOW })
  mock.store(on)
  const resetsAt = new Date(NOW + 3 * 60 * MIN).toISOString()
  const { lines, toasts } = engine(on, () => ({
    rateLimits: [{ kind: 'five_hour', percentUsed: 30, resetsAt }, { kind: 'seven_day', percentUsed: 40, resetsAt }],
  }))
  await $.session.start(start)
  expect(lines.at(-1)).toStartWith('🟡 5h 30%')
  expect(lines.at(-1)).toContain('🟡 wk 40%')
  expect(toasts).toHaveLength(1)
  expect(toasts[0]).toStartWith('5h 30%')
})

test('cache, skills and memory come from the breakdown, and the cache counts down when idle', { options: { cacheTtlMin: 5 } }, async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  mock.store(on)
  const breakdown = {
    percentage: 12,
    rawMaxTokens: 200_000,
    skills: { totalSkills: 72, includedSkills: 72, tokens: 3_000, skillFrontmatter: [] },
    memoryFiles: [{ path: '/r/CLAUDE.md', type: 'Project', tokens: 900 }, { path: '/u/CLAUDE.md', type: 'User', tokens: 400 }],
    apiUsage: { input_tokens: 500, output_tokens: 80, cache_creation_input_tokens: 20_000, cache_read_input_tokens: 0 },
  }
  const resetsAt = new Date(NOW + 3 * 60 * MIN).toISOString()
  const { lines } = engine(on, () => ({
    context: { percent: 10, window: 200_000, breakdown } as unknown as SessionUsage['context'],
    rateLimits: [{ kind: 'five_hour', percentUsed: 5, resetsAt }],
  }))
  on('turn.complete', () => ({ text: '' }))
  const turn = { answer: 'OK', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' } as const
  await $.session.start(start)
  // a cold start: written, nothing read yet
  await $.turn.complete(turn)
  expect(lines.at(-1)).toEndWith('🟢 compact 12% · ⚪ cache – · 72 skills · 2 mem')
  // a subagent's turn doesn't count
  breakdown.apiUsage = { input_tokens: 500, output_tokens: 80, cache_creation_input_tokens: 1_500, cache_read_input_tokens: 18_000 }
  await $.turn.complete({ ...turn, agentId: 'a1' })
  expect(lines.at(-1)).toEndWith('⚪ cache – · 72 skills · 2 mem')
  await $.turn.complete(turn)
  expect(lines.at(-1)).toEndWith('🟢 cache 90% 5m · 72 skills · 2 mem')
  await clock.advance(3 * MIN)
  expect(lines.at(-1)).toEndWith('🟢 cache 90% 2m · 72 skills · 2 mem')
  await clock.advance(3 * MIN)
  expect(lines.at(-1)).toEndWith('🟡 cache 90% cold · 72 skills · 2 mem')
})

test('on a subscription the cache lives an hour unless Claude Code is told otherwise', async ($, on) => {
  mock.clock(on, { now: NOW })
  mock.store(on)
  const breakdown = {
    percentage: 12, rawMaxTokens: 200_000, memoryFiles: [],
    apiUsage: { input_tokens: 500, output_tokens: 80, cache_creation_input_tokens: 1_500, cache_read_input_tokens: 18_000 },
  }
  const resetsAt = new Date(NOW + 3 * 60 * MIN).toISOString()
  const { lines } = engine(on, () => ({
    context: { percent: 10, window: 200_000, breakdown } as unknown as SessionUsage['context'],
    rateLimits: [{ kind: 'five_hour', percentUsed: 5, resetsAt }],
  }))
  on('turn.complete', () => ({ text: '' }))
  const turn = { answer: 'OK', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' } as const
  await $.session.start(start)
  await $.turn.complete(turn)
  await $.turn.complete(turn)
  expect(lines.at(-1)).toContain('🟢 cache 90% 1h00m')
})

test('promptCacheTtl in settings sets the countdown', async ($, on) => {
  mock.clock(on, { now: NOW })
  mock.store(on)
  on('settings.read', () => ({ value: { promptCacheTtl: '5m' } }))
  const breakdown = {
    percentage: 12, rawMaxTokens: 200_000, memoryFiles: [],
    apiUsage: { input_tokens: 500, output_tokens: 80, cache_creation_input_tokens: 1_500, cache_read_input_tokens: 18_000 },
  }
  const resetsAt = new Date(NOW + 3 * 60 * MIN).toISOString()
  const { lines } = engine(on, () => ({
    context: { percent: 10, window: 200_000, breakdown } as unknown as SessionUsage['context'],
    rateLimits: [{ kind: 'five_hour', percentUsed: 5, resetsAt }],
  }))
  on('turn.complete', () => ({ text: '' }))
  const turn = { answer: 'OK', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' } as const
  await $.session.start(start)
  await $.turn.complete(turn)
  await $.turn.complete(turn)
  expect(lines.at(-1)).toContain('🟢 cache 90% 5m')
})

test('/clear and compaction start the cache count over', async ($, on) => {
  mock.clock(on, { now: NOW })
  mock.store(on)
  const breakdown = {
    percentage: 40, rawMaxTokens: 200_000, memoryFiles: [],
    apiUsage: { input_tokens: 500, output_tokens: 80, cache_creation_input_tokens: 1_500, cache_read_input_tokens: 18_000 },
  }
  let startedAt = NOW
  const resetsAt = new Date(NOW + 3 * 60 * MIN).toISOString()
  const { lines } = engine(on, () => ({
    startedAt,
    context: { percent: 10, window: 200_000, breakdown } as unknown as SessionUsage['context'],
    rateLimits: [{ kind: 'five_hour', percentUsed: 5, resetsAt }],
  }))
  on('turn.complete', () => ({ text: '' }))
  const turn = { answer: 'OK', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' } as const
  await $.session.start(start)
  await $.turn.complete(turn)
  await $.turn.complete(turn)
  expect(lines.at(-1)).toContain('🟢 cache 90%')

  startedAt = NOW + MIN // /clear
  await $.turn.complete(turn)
  expect(lines.at(-1)).toContain('⚪ cache –')
  await $.turn.complete(turn)
  expect(lines.at(-1)).toContain('🟢 cache 90%')

  breakdown.percentage = 8 // compacted
  await $.turn.complete(turn)
  expect(lines.at(-1)).toContain('⚪ cache –')
})
