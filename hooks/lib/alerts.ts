import { worse, type Config, type Level, type Wall, type WallId } from './verdict'

export type AlertState = {
  // `<wall>:<window>:<level>` already toasted, for `once`
  fired: readonly string[]
  // each wall's level at the last check, for `every`
  levels: Partial<Record<WallId, Level>>
}

// which stretch a wall's reading belongs to; a new one may toast again
export type Windows = { day: string; compactEpoch: number }

export const emptyAlerts = (): AlertState => ({ fired: [], levels: {} })

const TEN_MIN = 600_000

const windowOf = (w: Wall, win: Windows) =>
  w.id === 'compact' ? `c${win.compactEpoch}`
  : w.id === 'daily' ? win.day
  // reset times come back from each response; rounding absorbs jitter
  : w.resetsAt === undefined ? '' : String(Math.round(w.resetsAt / TEN_MIN))

// the walls to toast now, and the state to keep for next time; only the wall
// the line names may toast, so two limits crossing together make one toast
export const check = (
  walls: readonly Wall[],
  named: Wall | undefined,
  mode: Config['alerts'],
  state: AlertState,
  win: Windows,
) => {
  const levels: AlertState['levels'] = {}
  const fired = [...state.fired]
  const due: Wall[] = []
  for (const w of walls) {
    levels[w.id] = w.level
    if (w.id !== named?.id || (w.level !== 'amber' && w.level !== 'red')) continue
    if (mode === 'every') {
      if (worse(state.levels[w.id] ?? 'green', w.level)) due.push(w)
    } else if (mode === 'once') {
      const at = `${w.id}:${windowOf(w, win)}:`
      // falling back from red to amber in the same window is not news
      if (!fired.includes(at + w.level) && !fired.includes(at + 'red')) {
        const key = at + w.level
        fired.push(key)
        due.push(w)
      }
    }
  }
  return { due, state: { fired: fired.slice(-50), levels } }
}
