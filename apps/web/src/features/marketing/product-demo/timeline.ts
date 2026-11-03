import { researchStepsAt } from './research'

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
const editorDuration = 14000
const restAfterEditor = 1800
const rowsReachedAfter = 420
const agentRowReachedAfter = 940
const rowsLeftAfter = 980
const categoriesStartAfterEditor = 1500
const chipInterval = 200
const categoryCount = 2
const tagCount = 3
const lingerAfterFilling = 1000
const moveBetweenFields = 300
const researchCursorMovesAfterEditor = 1900
const researchCursorTravel = 1400
const researchHoverDuration = 500
const researchClickDuration = 220
const panelOpensAfterClick = 100
const tagsStartAfterArriving = 500
const writerLeavesCategoriesAfterEditor =
  categoriesStartAfterEditor + (categoryCount - 1) * chipInterval + lingerAfterFilling
const writerReachesTagsAfterEditor = writerLeavesCategoriesAfterEditor + moveBetweenFields
const tagsStartAfterEditor = writerReachesTagsAfterEditor + tagsStartAfterArriving
const writerLeavesTagsAfterEditor =
  tagsStartAfterEditor + (tagCount - 1) * chipInterval + lingerAfterFilling
const writerReachesBodyAfterEditor = writerLeavesTagsAfterEditor + moveBetweenFields

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
export type CursorTarget = 'rest' | 'row' | 'research'

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
  writerOnCategories: boolean
  writerOnTags: boolean
  writerOnBody: boolean
  researchSteps: number
  cursorTarget: CursorTarget
  researchHovered: boolean
  researchPanelOpen: boolean
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
  writerOnCategories: false,
  writerOnTags: false,
  writerOnBody: false,
  researchSteps: 0,
  cursorTarget: 'rest',
  researchHovered: false,
  researchPanelOpen: false,
}

function chipsArrived(sinceFirst: number, total: number) {
  if (sinceFirst < 0) return 0
  return Math.min(total, Math.floor(sinceFirst / chipInterval) + 1)
}

const researchCursorArrivesAfterEditor = researchCursorMovesAfterEditor + researchCursorTravel
const researchClickAfterEditor = researchCursorArrivesAfterEditor + researchHoverDuration
const researchClickEndsAfterEditor = researchClickAfterEditor + researchClickDuration
const researchPanelOpensAfterEditor = researchClickAfterEditor + panelOpensAfterClick

function researchCursorAt(sinceEditor: number): CursorState {
  if (sinceEditor < researchCursorMovesAfterEditor) return 'still'
  if (sinceEditor < researchCursorArrivesAfterEditor) return 'moving'
  if (sinceEditor < researchClickAfterEditor) return 'hovering'
  if (sinceEditor < researchClickEndsAfterEditor) return 'clicking'
  return 'still'
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
  const sinceEditor = elapsed - editorOpensAt
  const inEditor = elapsed >= editorOpensAt && elapsed < editorClosesAt
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
      (inEditor &&
        sinceEditor >= researchCursorArrivesAfterEditor - 100 &&
        sinceEditor < researchClickEndsAfterEditor) ||
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
              : inEditor
                ? researchCursorAt(sinceEditor)
                : 'still',
    cursorTarget:
      elapsed < cursorShownAt || elapsed >= editorClosesAt
        ? 'rest'
        : inEditor && sinceEditor >= researchCursorMovesAfterEditor
          ? 'research'
          : 'row',
    researchHovered: inEditor && sinceEditor >= researchCursorArrivesAfterEditor - 100,
    researchPanelOpen: inEditor && sinceEditor >= researchPanelOpensAfterEditor,
    view: elapsed >= editorOpensAt && elapsed < editorClosesAt ? 'editor' : 'table',
    agentRowHovered: elapsed >= cursorShownAt + agentRowReachedAfter && elapsed < editorOpensAt,
    categories: chipsArrived(elapsed - editorOpensAt - categoriesStartAfterEditor, categoryCount),
    tags: chipsArrived(elapsed - editorOpensAt - tagsStartAfterEditor, tagCount),
    writerOnCategories: elapsed - editorOpensAt < writerLeavesCategoriesAfterEditor,
    writerOnTags:
      elapsed - editorOpensAt >= writerReachesTagsAfterEditor &&
      elapsed - editorOpensAt < writerLeavesTagsAfterEditor,
    writerOnBody: elapsed - editorOpensAt >= writerReachesBodyAfterEditor,
    researchSteps: researchStepsAt(sinceEditor),
  }
}
