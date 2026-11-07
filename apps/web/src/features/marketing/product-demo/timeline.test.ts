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

  it('moves in straight lines, with at most a slight arc on long trips', () => {
    for (const move of moves) {
      expect(Math.abs(move.bend), `${move.from} to ${move.to}`).toBeLessThanOrEqual(0.04)
      if (move.distance < 450) expect(move.bend, `${move.from} to ${move.to}`).toBe(0)
    }
  })
})
