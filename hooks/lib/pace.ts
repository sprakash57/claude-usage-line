export const HOUR = 3_600_000

export const WINDOW_MS: Record<string, number> = {
  five_hour: 5 * HOUR,
  seven_day: 7 * 24 * HOUR,
}

// share of a window that has passed, given when it ends
export const elapsedPct = (resetsAt: number, windowMs: number, now: number) =>
  Math.min(100, Math.max(0, 100 * (1 - (resetsAt - now) / windowMs)))

// points used ahead (+) or behind (-) an even spread over the window
export const paceDelta = (used: number, resetsAt: number, windowMs: number, now: number) =>
  used - elapsedPct(resetsAt, windowMs, now)
