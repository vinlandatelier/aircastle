export const prompt = "Recently shipped MCP for our app, let's announce it"

const shortcutShownAt = 1000
const shortcutHiddenAt = 1700
const dialogOpensAt = 1500
const typingStartsAt = 1900
const pauseBeforeSend = 450
const sendPressDuration = 350
const enterChipDuration = 700
const dialogCloseDuration = 300
const cursorDelayAfterRow = 1300
const cursorTravelDuration = 900
const hoverDuration = 3200
const restAfterHover = 400

const keystrokeDelays = Array.from(prompt, (character, index) => {
  const pause = character === ' ' || character === ',' ? 40 : 0
  return 30 + ((index * 37) % 11) + pause
})
const typingEndsAt = keystrokeDelays.reduce((at, delay) => at + delay, typingStartsAt)
const sendAt = typingEndsAt + pauseBeforeSend
const dialogClosesAt = sendAt + sendPressDuration
const cursorShownAt = dialogClosesAt + dialogCloseDuration + cursorDelayAfterRow
const cursorArrivesAt = cursorShownAt + cursorTravelDuration
const hoverEndsAt = cursorArrivesAt + hoverDuration

/** Length of one loop of the product preview, in milliseconds. */
export const loopDuration = hoverEndsAt + restAfterHover

export type DialogState = 'closed' | 'open' | 'closing'
export type Shortcut = 'open-agents' | 'send'
export type CursorState = 'hidden' | 'moving' | 'hovering'

/** Everything the preview shows at one moment. */
export type Frame = {
  shortcut: Shortcut | undefined
  dialog: DialogState
  typed: number
  sendPressed: boolean
  agentRow: boolean
  cursor: CursorState
}

/** The still frame shown when motion is reduced. */
export const stillFrame: Frame = {
  shortcut: undefined,
  dialog: 'closed',
  typed: 0,
  sendPressed: false,
  agentRow: true,
  cursor: 'hidden',
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
    elapsed >= dialogOpensAt && elapsed < dialogClosesAt
      ? 'open'
      : elapsed >= dialogClosesAt && elapsed < dialogClosesAt + dialogCloseDuration
        ? 'closing'
        : 'closed'
  const shortcut: Shortcut | undefined =
    elapsed >= shortcutShownAt && elapsed < shortcutHiddenAt
      ? 'open-agents'
      : elapsed >= sendAt - 60 && elapsed < sendAt + enterChipDuration
        ? 'send'
        : undefined
  return {
    shortcut,
    dialog,
    typed: typedAt(elapsed),
    sendPressed: elapsed >= sendAt && elapsed < dialogClosesAt,
    agentRow: elapsed >= dialogClosesAt,
    cursor:
      elapsed < cursorShownAt || elapsed >= hoverEndsAt
        ? 'hidden'
        : elapsed < cursorArrivesAt
          ? 'moving'
          : 'hovering',
  }
}
