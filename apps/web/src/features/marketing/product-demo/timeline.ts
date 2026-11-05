import { bodyDraftDuration } from './body-draft'
import { docsDecisionAnsweredAt, researchLog, researchStepsAt } from './research'

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
const editorDuration = 17000
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
const decisionCursorTravel = 1400
const decisionHoverDuration = 400
const decisionClickDuration = 220
const decisionAnsweredAfterClick = 150
const tagsStartAfterArriving = 500
const editorCursorTravel = 1400
const scrollDuringCursorTravel = 600
const seoStartsAfterScroll = 900
const coverGeneratingAfterEditor = 900

/** When Askeladd's SEO fields finish typing, in milliseconds after he starts. */
export const seoTiming = { metaTitleTyped: 700, done: 4050 } as const
const coverDoneAfterEditor = 4200
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
export type CursorTarget = 'rest' | 'row' | 'research' | 'decision' | 'editor' | 'preview'
/** Einar's cover image: untouched, the skill starting, the image developing, or finished. */
export type CoverState = 'idle' | 'starting' | 'generating' | 'done'

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
  cursorFrom: CursorTarget
  cursorProgress: number
  researchHovered: boolean
  researchPanelOpen: boolean
  cover: CoverState
  editorScroll: number
  bodyElapsed: number | null
  seoElapsed: number | null
  socialImage: CoverState
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
  cursorFrom: 'rest',
  cursorProgress: 1,
  researchHovered: false,
  researchPanelOpen: false,
  cover: 'idle',
  editorScroll: 0,
  bodyElapsed: null,
  seoElapsed: null,
  socialImage: 'idle',
}

function chipsArrivedEvery(sinceFirst: number, interval: number, total: number) {
  if (sinceFirst < 0) return 0
  return Math.min(total, Math.floor(sinceFirst / interval) + 1)
}

function chipsArrived(sinceFirst: number, total: number) {
  return chipsArrivedEvery(sinceFirst, chipInterval, total)
}

const researchCursorArrivesAfterEditor = researchCursorMovesAfterEditor + researchCursorTravel
const researchClickAfterEditor = researchCursorArrivesAfterEditor + researchHoverDuration
const researchClickEndsAfterEditor = researchClickAfterEditor + researchClickDuration
const researchPanelOpensAfterEditor = researchClickAfterEditor + panelOpensAfterClick
const decisionClickAfterEditor = docsDecisionAnsweredAt - decisionAnsweredAfterClick
const decisionCursorArrivesAfterEditor = decisionClickAfterEditor - decisionHoverDuration
const decisionCursorMovesAfterEditor = decisionCursorArrivesAfterEditor - decisionCursorTravel
const decisionClickEndsAfterEditor = decisionClickAfterEditor + decisionClickDuration
const editorCursorArrivesAfterEditor = decisionClickEndsAfterEditor + editorCursorTravel
const scrollAfterEditor = decisionClickEndsAfterEditor + scrollDuringCursorTravel
const seoStartsAfterEditor = scrollAfterEditor + seoStartsAfterScroll
const researchDoneAfterEditor = researchLog.at(-1)?.at ?? 0
const bodyDoneAfterEditor = researchDoneAfterEditor + bodyDraftDuration
const seoDoneAfterEditor = seoStartsAfterEditor + seoTiming.done
const socialImageGeneratingAfterEditor = scrollAfterEditor + 300
const socialImageDoneAfterEditor = seoStartsAfterEditor + seoTiming.metaTitleTyped
const previewCursorTravel = 1400
const previewCursorMovesAfterEditor = Math.max(
  seoDoneAfterEditor,
  bodyDoneAfterEditor - previewCursorTravel / 2,
)
const previewCursorArrivesAfterEditor = previewCursorMovesAfterEditor + previewCursorTravel
const previewClickAfterEditor = previewCursorArrivesAfterEditor + 500
const previewClickEndsAfterEditor = previewClickAfterEditor + clickDuration

const cursorMoves: readonly { at: number; from: CursorTarget; to: CursorTarget }[] = [
  { at: cursorShownAt, from: 'rest', to: 'row' },
  { at: editorOpensAt + researchCursorMovesAfterEditor, from: 'row', to: 'research' },
  { at: editorOpensAt + decisionCursorMovesAfterEditor, from: 'research', to: 'decision' },
  { at: editorOpensAt + decisionClickEndsAfterEditor, from: 'decision', to: 'editor' },
  { at: editorOpensAt + previewCursorMovesAfterEditor, from: 'editor', to: 'preview' },
  { at: editorClosesAt, from: 'preview', to: 'rest' },
]

function motionProgress(elapsed: number, duration: number) {
  const t = Math.max(0, Math.min(1, elapsed / duration))
  return t * t * t * (t * (6 * t - 15) + 10)
}

function researchCursorAt(sinceEditor: number): CursorState {
  if (sinceEditor < researchCursorMovesAfterEditor) return 'still'
  if (sinceEditor < researchCursorArrivesAfterEditor) return 'moving'
  if (sinceEditor < researchClickAfterEditor) return 'hovering'
  if (sinceEditor < researchClickEndsAfterEditor) return 'clicking'
  if (sinceEditor < decisionCursorMovesAfterEditor) return 'still'
  if (sinceEditor < decisionCursorArrivesAfterEditor) return 'moving'
  if (sinceEditor < decisionClickAfterEditor) return 'hovering'
  if (sinceEditor < decisionClickEndsAfterEditor) return 'clicking'
  if (sinceEditor < editorCursorArrivesAfterEditor) return 'moving'
  if (sinceEditor < previewCursorMovesAfterEditor) return 'still'
  if (sinceEditor < previewCursorArrivesAfterEditor) return 'moving'
  if (sinceEditor < previewClickAfterEditor) return 'hovering'
  if (sinceEditor < previewClickEndsAfterEditor) return 'clicking'
  return 'still'
}

function socialImageAt(sinceEditor: number, inEditor: boolean): CoverState {
  if (!inEditor || sinceEditor < scrollAfterEditor) return 'idle'
  if (sinceEditor < socialImageGeneratingAfterEditor) return 'starting'
  if (sinceEditor < socialImageDoneAfterEditor) return 'generating'
  return 'done'
}

function coverAt(sinceEditor: number, inEditor: boolean): CoverState {
  if (!inEditor) return 'idle'
  if (sinceEditor < coverGeneratingAfterEditor) return 'starting'
  if (sinceEditor < coverDoneAfterEditor) return 'generating'
  return 'done'
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
  const cursorMove = cursorMoves.findLast((move) => elapsed >= move.at)
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
      (inEditor &&
        sinceEditor >= decisionCursorArrivesAfterEditor - 100 &&
        sinceEditor < decisionClickEndsAfterEditor) ||
      (inEditor &&
        sinceEditor >= previewCursorArrivesAfterEditor - 100 &&
        sinceEditor < previewClickEndsAfterEditor) ||
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
    cursorTarget: cursorMove?.to ?? 'rest',
    cursorFrom: cursorMove?.from ?? 'rest',
    cursorProgress: cursorMove ? motionProgress(elapsed - cursorMove.at, cursorTravelDuration) : 1,
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
    writerOnBody: sinceEditor >= writerReachesBodyAfterEditor && sinceEditor < bodyDoneAfterEditor,
    researchSteps: researchStepsAt(sinceEditor),
    cover: coverAt(sinceEditor, inEditor),
    editorScroll: inEditor ? motionProgress(sinceEditor - scrollAfterEditor, 1400) : 0,
    bodyElapsed:
      inEditor && sinceEditor >= researchDoneAfterEditor
        ? sinceEditor - researchDoneAfterEditor
        : null,
    seoElapsed: inEditor ? sinceEditor - seoStartsAfterEditor : null,
    socialImage: socialImageAt(sinceEditor, inEditor),
  }
}
