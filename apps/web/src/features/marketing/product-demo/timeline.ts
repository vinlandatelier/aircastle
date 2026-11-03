export const prompt = "Recently shipped MCP for our app, let's announce it"

const shortcutAt = 700
const dialogOpenAt = 1100
const typingStartsAt = 1500
const cursorToSendDelay = 220
const pressDuration = 160
const collapseDuration = 520
const holdAfterCollapse = 3200

const keystrokeDelays = Array.from(prompt, (character, index) => {
  const pause = character === ' ' || character === ',' ? 26 : 0
  return 24 + ((index * 37) % 19) + pause
})
const typingEndsAt = keystrokeDelays.reduce((at, delay) => at + delay, typingStartsAt)
const cursorAtSendAt = typingEndsAt + cursorToSendDelay + 650
const pressAt = cursorAtSendAt + 120
const collapseAt = pressAt + pressDuration
const collapsedAt = collapseAt + collapseDuration

/** Length of one loop of the product preview, in milliseconds. */
export const loopDuration = collapsedAt + holdAfterCollapse

export type DialogState = 'closed' | 'open' | 'collapsing'
export type CursorSpot = 'rest' | 'send'

/** Everything the preview shows at one moment. */
export type Frame = {
  shortcut: boolean
  dialog: DialogState
  typed: number
  cursor: CursorSpot
  pressed: boolean
  newPost: boolean
}

/** The preview's final state, shown without motion. */
export const finalFrame: Frame = {
  shortcut: false,
  dialog: 'closed',
  typed: prompt.length,
  cursor: 'rest',
  pressed: false,
  newPost: true,
}

function typedAt(elapsed: number) {
  let at = typingStartsAt
  for (const [index, delay] of keystrokeDelays.entries()) {
    at += delay
    if (elapsed < at) return index
  }
  return prompt.length
}

/** Maps time since the loop started to what the preview shows. */
export function frameAt(elapsed: number): Frame {
  const dialog: DialogState =
    elapsed < dialogOpenAt || elapsed >= collapsedAt
      ? 'closed'
      : elapsed < collapseAt
        ? 'open'
        : 'collapsing'
  return {
    shortcut: elapsed >= shortcutAt && elapsed < typingStartsAt,
    dialog,
    typed: typedAt(elapsed),
    cursor: elapsed >= typingEndsAt + cursorToSendDelay && elapsed < collapsedAt ? 'send' : 'rest',
    pressed: elapsed >= pressAt && elapsed < collapseAt,
    newPost: elapsed >= collapseAt,
  }
}
