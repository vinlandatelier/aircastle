import { cursorSpots, type CursorTarget } from './cursor-path'
import type { Frame } from './timeline'

const frameWidth = 1280

/** How much of the preview's width a phone shows at once, in frame pixels. */
export const cameraWindow = 600

const centre = frameWidth / 2

function focusOf(target: CursorTarget) {
  return target === 'rest' ? centre : cursorSpots[target].left
}

/** Where the phone's window sits over the preview, as the frame x of its left edge. It follows the cursor's path, starts and ends centred, and never leaves the preview. */
export function cameraLeft(frame: Frame) {
  const from = focusOf(frame.cursorFrom)
  const to = focusOf(frame.cursorTarget)
  const following = from + (to - from) * frame.cursorProgress
  const focus = following + (centre - following) * frame.outroOpacity
  return Math.max(0, Math.min(frameWidth - cameraWindow, focus - cameraWindow / 2))
}
