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
const cursorTravelDuration = 1400
const hoverDuration = 1500
const clickDuration = 220
const editorOpensAfterClick = 180
const editorDuration = 8000
const restAfterEditor = 1800
const rowsReachedAfter = 420
const agentRowReachedAfter = 940
const rowsLeftAfter = 980
const categoriesStartAfterEditor = 1500
const tagsStartAfterEditor = 2500
const chipInterval = 200
const tagCount = 3
const writerLeavesTaxonomyAfterEditor = tagsStartAfterEditor + (tagCount - 1) * chipInterval + 1000
const writerReachesBodyAfterEditor = writerLeavesTaxonomyAfterEditor + 300

const keystrokeDelays = Array.from(prompt, (character, index) => {
  const pause = character === ' ' || character === ',' ? 40 : 0
  return 30 + ((index * 37) % 11) + pause
})
const typingEndsAt = keystrokeDelays.reduce((at, delay) => at + delay, typingStartsAt)
const sendAt = typingEndsAt + pauseBeforeSend
const dialogClosesAt = sendAt + sendPressDuration
const cursorShownAt = dialogClosesAt + dialogCloseDuration + cursorDelayAfterRow
const cursorArrivesAt = cursorShownAt + cursorTravelDuration
const clickAt = cursorArrivesAt + hoverDuration
const clickEndsAt = clickAt + clickDuration
const editorOpensAt = clickAt + editorOpensAfterClick
const editorClosesAt = editorOpensAt + editorDuration

/** Length of one loop of the product preview, in milliseconds. */
export const loopDuration = editorClosesAt + restAfterEditor

export type DialogState = 'closed' | 'open' | 'closing'
export type Shortcut = 'open-agents' | 'send'
export type CursorState = 'resting' | 'moving' | 'hovering' | 'clicking' | 'still'
export type View = 'table' | 'editor'
export type CursorShape = 'arrow' | 'pointer'
export type WriterFocus = 'taxonomy' | 'body' | undefined

/** Everything the preview shows at one moment. */
export type Frame = {
  shortcut: Shortcut | undefined
  dialog: DialogState
  typed: number
  sendPressed: boolean
  agentRow: boolean
  cursor: CursorState
  cursorShape: CursorShape
  view: View
  agentRowHovered: boolean
  categories: number
  tags: number
  writer: WriterFocus
}

/** The still frame shown when motion is reduced. */
export const stillFrame: Frame = {
  shortcut: undefined,
  dialog: 'closed',
  typed: 0,
  sendPressed: false,
  agentRow: true,
  cursor: 'resting',
  cursorShape: 'arrow',
  view: 'table',
  agentRowHovered: false,
  categories: 0,
  tags: 0,
  writer: undefined,
}

function chipsArrived(sinceFirst: number, total: number) {
  if (sinceFirst < 0) return 0
  return Math.min(total, Math.floor(sinceFirst / chipInterval) + 1)
}

function writerFocusAt(sinceEditor: number): WriterFocus {
  if (sinceEditor < writerLeavesTaxonomyAfterEditor) return 'taxonomy'
  if (sinceEditor < writerReachesBodyAfterEditor) return undefined
  return 'body'
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
    cursorShape:
      (elapsed >= cursorShownAt + rowsReachedAfter && elapsed < clickEndsAt) ||
      (elapsed >= editorClosesAt && elapsed < editorClosesAt + rowsLeftAfter)
        ? 'pointer'
        : 'arrow',
    cursor:
      elapsed < cursorShownAt || elapsed >= editorClosesAt
        ? 'resting'
        : elapsed < cursorArrivesAt
          ? 'moving'
          : elapsed < clickAt
            ? 'hovering'
            : elapsed < clickEndsAt
              ? 'clicking'
              : 'still',
    view: elapsed >= editorOpensAt && elapsed < editorClosesAt ? 'editor' : 'table',
    agentRowHovered: elapsed >= cursorShownAt + agentRowReachedAfter && elapsed < editorOpensAt,
    categories: chipsArrived(elapsed - editorOpensAt - categoriesStartAfterEditor, 2),
    tags: chipsArrived(elapsed - editorOpensAt - tagsStartAfterEditor, tagCount),
    writer: writerFocusAt(elapsed - editorOpensAt),
  }
}
