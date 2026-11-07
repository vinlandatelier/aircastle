import { describe, expect, it } from 'vite-plus/test'
import { cursorSpots } from './cursor-path'
import { frameAt, loopDuration } from './timeline'

const step = 5

type Move = {
  from: string
  to: string
  startsAt: number
  arrivesAt: number | null
  distance: number
  bend: number
}

function playLoop() {
  const moves: Move[] = []
  const presses: { at: number; waited: number; on: string }[] = []
  let previousState = ''
  for (let elapsed = 0; elapsed < loopDuration; elapsed += step) {
    const frame = frameAt(elapsed)
    const current = moves.at(-1)
    if (!current || current.from !== frame.cursorFrom || current.to !== frame.cursorTarget) {
      const from = cursorSpots[frame.cursorFrom]
      const to = cursorSpots[frame.cursorTarget]
      moves.push({
        from: frame.cursorFrom,
        to: frame.cursorTarget,
        startsAt: elapsed,
        arrivesAt: null,
        distance: Math.hypot(to.left - from.left, to.top - from.top),
        bend: frame.cursorBend,
      })
    }
    const move = moves.at(-1)
    if (move && move.arrivesAt === null && frame.cursorProgress >= 1) move.arrivesAt = elapsed
    if (frame.cursor === 'clicking' && previousState !== 'clicking' && move?.arrivesAt != null)
      presses.push({ at: elapsed, waited: elapsed - move.arrivesAt, on: move.to })
    previousState = frame.cursor
  }
  return { moves: moves.filter((move) => move.distance > 0 && move.to !== 'rest'), presses }
}

describe('product preview cursor', () => {
  const { moves, presses } = playLoop()

  it('travels every distance at the same unhurried pace', () => {
    expect(moves.length).toBeGreaterThan(10)
    for (const move of moves) {
      const duration = (move.arrivesAt ?? Infinity) - move.startsAt
      expect(duration, `${move.from} to ${move.to}`).toBeLessThanOrEqual(1100)
      if (move.distance < 300) continue
      const pace = move.distance / duration
      expect(pace, `${move.from} to ${move.to} px per ms`).toBeGreaterThan(0.55)
      expect(pace, `${move.from} to ${move.to} px per ms`).toBeLessThan(0.8)
    }
  })

  it('clicks as soon as it reaches a button', () => {
    expect(presses.length).toBeGreaterThan(5)
    for (const press of presses)
      expect(press.waited, `waited on ${press.on}`).toBeLessThanOrEqual(
        press.on === 'row' ? 400 : 120,
      )
  })

  it('drifts off somewhere and pauses, rather than freezing, whenever it waits for a while', () => {
    type Stretch = { from: number; key: string; reach: number; resting: number; steps: number }
    let stretch = null as Stretch | null
    let previous = frameAt(0)
    const frozen: string[] = []
    const fidgety: string[] = []
    const close = (end: number) => {
      if (!stretch || end - stretch.from <= 1500) return
      if (stretch.reach < 40) frozen.push(`${stretch.key} for ${end - stretch.from}ms`)
      if (stretch.resting / stretch.steps < 0.3) fidgety.push(stretch.key)
    }
    for (let elapsed = 0; elapsed < loopDuration; elapsed += step) {
      const frame = frameAt(elapsed)
      const waiting =
        frame.cursor !== 'resting' &&
        !frame.cursorBusy &&
        frame.outroElapsed === null &&
        frame.cursorProgress >= 1 &&
        (frame.cursor === 'still' || frame.cursor === 'hovering')
      const key = `${frame.cursorFrom}->${frame.cursorTarget}`
      if (waiting && stretch?.key === key) {
        const moved = Math.hypot(
          frame.cursorDriftX - previous.cursorDriftX,
          frame.cursorDriftY - previous.cursorDriftY,
        )
        stretch.reach = Math.max(stretch.reach, Math.hypot(frame.cursorDriftX, frame.cursorDriftY))
        stretch.resting += moved < 0.05 ? 1 : 0
        stretch.steps += 1
      } else {
        close(elapsed)
        stretch = waiting ? { from: elapsed, key, reach: 0, resting: 0, steps: 0 } : null
      }
      previous = frame
    }
    expect(frozen, 'long waits go somewhere').toEqual([])
    expect(fidgety, 'it pauses where it goes instead of jiggling').toEqual([])
  })

  it('holds still while typing or scrolling', () => {
    let busy = 0
    for (let elapsed = 0; elapsed < loopDuration; elapsed += step) {
      const frame = frameAt(elapsed)
      if (!frame.cursorBusy) continue
      busy += 1
      expect(Math.hypot(frame.cursorDriftX, frame.cursorDriftY), `at ${elapsed}ms`).toBeLessThan(
        0.5,
      )
    }
    expect(busy).toBeGreaterThan(100)
  })

  it('is exactly on target whenever it clicks or sets off', () => {
    let previous = frameAt(0)
    for (let elapsed = step; elapsed < loopDuration; elapsed += step) {
      const frame = frameAt(elapsed)
      const setsOff =
        frame.cursorTarget !== previous.cursorTarget || frame.cursorFrom !== previous.cursorFrom
      if (frame.cursor === 'clicking' || frame.cursor === 'dragging' || setsOff)
        expect(Math.hypot(frame.cursorDriftX, frame.cursorDriftY), `at ${elapsed}ms`).toBeLessThan(
          0.5,
        )
      previous = frame
    }
  })

  it('moves in straight lines, with at most a slight arc on long trips', () => {
    for (const move of moves) {
      expect(Math.abs(move.bend), `${move.from} to ${move.to}`).toBeLessThanOrEqual(0.04)
      if (move.distance < 450) expect(move.bend, `${move.from} to ${move.to}`).toBe(0)
    }
  })
})
