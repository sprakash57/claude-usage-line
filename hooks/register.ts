import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

const pct = (n: number | undefined) => (n === undefined ? '–' : `${Math.round(n)}%`)

const limit = (limits: SessionRateLimit[], kind: string) =>
  pct(limits.find(l => l.kind === kind)?.percentUsed)

async function draw($: EngineInterface) {
  // `summary` estimates locally (no API calls) and gives the auto-compact window
  const { context, rateLimits } = await $.session.usage({ breakdown: 'summary' })
  const compact = context.breakdown?.percentage

  $.ui.status(
    `5h ${limit(rateLimits, 'five_hour')} · wk ${limit(rateLimits, 'seven_day')} · ` +
      `ctx ${pct(context.percent)} · compact ${pct(compact)}`,
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await draw($)
    return result
  })

  on('session.measure', async ($, e, next) => {
    await draw($)
    return next(e)
  })
}
