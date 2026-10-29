import { describe, expect, test } from 'bun:test'
import { emptyTrack, sample, turnsLeft } from '../hooks/lib/forecast'

const feed = (values: number[]) => values.reduce(sample, emptyTrack())

describe('forecast (AC13)', () => {
  test('needs 5 samples', () => {
    expect(turnsLeft(84, feed([80, 81, 82, 83, 84]))).toBeUndefined()
    expect(turnsLeft(85, feed([80, 81, 82, 83, 84, 85]))).toBe(15)
  })

  test('an unsteady rate gives no forecast', () => {
    expect(turnsLeft(90, feed([50, 50, 50, 70, 70, 90]))).toBeUndefined()
  })

  test('no growth gives no forecast', () => {
    expect(turnsLeft(50, feed([50, 50, 50, 50, 50, 50]))).toBeUndefined()
  })

  test('a drop (reset or compaction) starts over', () => {
    const t = feed([80, 82, 84, 86, 88, 90, 20])
    expect(t.deltas).toEqual([])
    expect(turnsLeft(20, t)).toBeUndefined()
  })

  test('missing readings are skipped', () => {
    expect(sample(emptyTrack(), undefined)).toEqual(emptyTrack())
  })
})
