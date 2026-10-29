// Per-turn growth of one percentage (5h used, compact %), reset when it drops
export type Track = { last?: number; deltas: number[] }

export const MIN_SAMPLES = 5
export const MAX_CV = 0.5
const KEEP = 20

export const emptyTrack = (): Track => ({ deltas: [] })

// a drop means the window reset or the conversation compacted: start over
export const sample = (track: Track, value: number | undefined): Track => {
  if (value === undefined) return track
  if (track.last === undefined || value < track.last) return { last: value, deltas: [] }
  return { last: value, deltas: [...track.deltas, value - track.last].slice(-KEEP) }
}

// turns until `used` reaches 100, or undefined while the rate is not steady
export const turnsLeft = (used: number, track: Track) => {
  const d = track.deltas
  if (d.length < MIN_SAMPLES) return undefined
  const mean = d.reduce((a, b) => a + b, 0) / d.length
  if (mean <= 0) return undefined
  const sd = Math.sqrt(d.reduce((a, b) => a + (b - mean) ** 2, 0) / d.length)
  if (sd / mean > MAX_CV) return undefined
  return Math.max(0, Math.floor((100 - used) / mean))
}
