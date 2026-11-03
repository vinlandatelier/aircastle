export const prompt = "Recently shipped MCP for our app, let's announce it"

const shortcutShownAt = 1000
const shortcutHiddenAt = 1700
const dialogOpensAt = 1500
const typingStartsAt = 1900
const holdAfterTyping = 2000
const dialogCloseDuration = 300
const restAfterClose = 1200

const keystrokeDelays = Array.from(prompt, (character, index) => {
  const pause = character === ' ' || character === ',' ? 26 : 0
  return 24 + ((index * 37) % 19) + pause
})
const typingEndsAt = keystrokeDelays.reduce((at, delay) => at + delay, typingStartsAt)
const dialogClosesAt = typingEndsAt + holdAfterTyping

/** Length of one loop of the product preview, in milliseconds. */
export const loopDuration = dialogClosesAt + dialogCloseDuration + restAfterClose

export type DialogState = 'closed' | 'open' | 'closing'

/** Everything the preview shows at one moment. */
export type Frame = {
  shortcut: boolean
  dialog: DialogState
  typed: number
}

/** The still frame shown when motion is reduced. */
export const stillFrame: Frame = { shortcut: false, dialog: 'closed', typed: 0 }

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
  return {
    shortcut: elapsed >= shortcutShownAt && elapsed < shortcutHiddenAt,
    dialog,
    typed: typedAt(elapsed),
  }
}
