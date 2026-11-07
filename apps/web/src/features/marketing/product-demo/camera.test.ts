import { describe, expect, it } from 'vite-plus/test'
import { cameraLeft, cameraWindow } from './camera'
import { cursorSpots } from './cursor-path'
import { frameAt, loopDuration } from './timeline'

const step = 5
const frameWidth = 1280

function cursorX(elapsed: number) {
  const frame = frameAt(elapsed)
  const from = cursorSpots[frame.cursorFrom]
  const to = cursorSpots[frame.cursorTarget]
  return from.left + (to.left - from.left) * frame.cursorProgress + frame.cursorDriftX
}

describe('mobile preview camera', () => {
  it('always shows a full-height slice that stays inside the preview', () => {
    for (let elapsed = 0; elapsed < loopDuration; elapsed += step) {
      const left = cameraLeft(frameAt(elapsed))
      expect(left).toBeGreaterThanOrEqual(0)
      expect(left + cameraWindow).toBeLessThanOrEqual(frameWidth)
    }
  })

  it('keeps the cursor in view whenever it clicks or drags', () => {
    for (let elapsed = 0; elapsed < loopDuration; elapsed += step) {
      const frame = frameAt(elapsed)
      if (frame.cursor !== 'clicking' && frame.cursor !== 'dragging') continue
      const left = cameraLeft(frame)
      const x = cursorX(elapsed)
      expect(x, `cursor at ${elapsed}ms`).toBeGreaterThan(left + 24)
      expect(x, `cursor at ${elapsed}ms`).toBeLessThan(left + cameraWindow - 24)
    }
  })

  it('pans smoothly, never jumping between frames', () => {
    let previous = cameraLeft(frameAt(0))
    for (let elapsed = step; elapsed < loopDuration; elapsed += step) {
      const left = cameraLeft(frameAt(elapsed))
      expect(Math.abs(left - previous), `at ${elapsed}ms`).toBeLessThan(12)
      previous = left
    }
    expect(Math.abs(cameraLeft(frameAt(0)) - previous), 'the loop wraps seamlessly').toBeLessThan(
      12,
    )
  })

  it('centres the opening dialog and the closing card', () => {
    const centred = (frameWidth - cameraWindow) / 2
    expect(cameraLeft(frameAt(2500))).toBeCloseTo(centred, 0)
    expect(cameraLeft(frameAt(loopDuration - 1500))).toBeCloseTo(centred, 0)
  })
})
