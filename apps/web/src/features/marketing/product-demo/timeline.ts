const shortcutShownAt = 1000
const shortcutHiddenAt = 1700
const dialogOpensAt = 1500
const dialogClosesAt = dialogOpensAt + 3000
const dialogCloseDuration = 300

/** Length of one loop of the product preview, in milliseconds. */
export const loopDuration = 6000

export type DialogState = 'closed' | 'open' | 'closing'

/** Everything the preview shows at one moment. */
export type Frame = {
  shortcut: boolean
  dialog: DialogState
}

/** The still frame shown when motion is reduced. */
export const stillFrame: Frame = { shortcut: false, dialog: 'closed' }

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
  }
}
