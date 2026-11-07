/** Where each cursor target sits in the preview frame, in frame pixels. */
export const cursorSpots = {
  rest: { left: 1010, top: 566 },
  row: { left: 320, top: 218 },
  research: { left: 700, top: 112 },
  decision: { left: 1045, top: 518 },
  editor: { left: 820, top: 470 },
  preview: { left: 790, top: 112 },
  'site-page': { left: 560, top: 470 },
  'line-start': { left: 210, top: 299 },
  'line-end': { left: 425, top: 327 },
  'site-read': { left: 600, top: 440 },
  reference: { left: 1000, top: 574 },
  publish: { left: 872, top: 108 },
  bell: { left: 1188, top: 52 },
  'notification-preview': { left: 1064, top: 242 },
  'docs-read': { left: 700, top: 460 },
  'docs-publish': { left: 1211, top: 110 },
} as const

/** A place the preview's cursor can move to. */
export type CursorTarget = keyof typeof cursorSpots

function distance(from: CursorTarget, to: CursorTarget) {
  const start = cursorSpots[from]
  const end = cursorSpots[to]
  return Math.hypot(end.left - start.left, end.top - start.top)
}

/** How long the cursor takes to travel between two targets, at one quick pace for every move. */
export function travelTime(from: CursorTarget, to: CursorTarget) {
  return Math.round(260 + distance(from, to))
}

/** How much a move arcs: straight for most moves, with a slight arc only on long trips. */
export function arcFor(from: CursorTarget, to: CursorTarget) {
  return distance(from, to) >= 450 ? 0.03 : 0
}

/** How long the cursor rests on a button before pressing it. */
export const pressDelay = 80

/** Where the cursor is drawn in the frame: along its move, bowed by its arc, plus any idle drift. */
export function cursorPosition({
  from,
  target,
  progress,
  curve,
  drift,
  spots = cursorSpots,
}: {
  spots?: Readonly<Record<CursorTarget, { left: number; top: number }>>
  from: CursorTarget
  target: CursorTarget
  progress: number
  curve: number
  drift: { x: number; y: number }
}) {
  const start = spots[from]
  const spot = spots[target]
  const dx = spot.left - start.left
  const dy = spot.top - start.top
  const bend = Math.sin(Math.PI * progress) * curve
  return {
    left: start.left + dx * progress - dy * bend + drift.x,
    top: start.top + dy * progress + dx * bend + drift.y,
  }
}
