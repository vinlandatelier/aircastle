import { bodyDraftDuration } from './body-draft'
import { arcFor, cursorSpots, pressDelay, travelTime, type CursorTarget } from './cursor-path'
import { docsDecisionAnsweredAt, researchLog, researchStepsAt } from './research'
import {
  askCursorPressed,
  askKeystroke,
  askTiming,
  confettiAt,
  cursorBusyWindows,
  type PublishedEntry,
} from './site-ask'

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
const cursorTravelDuration = travelTime('rest', 'row')
const rowHoverDuration = 350
const clickDuration = 220
const editorOpensAfterClick = 180
const restAfterEditor = 1400
const rowAgentCount = 5
const firstAgentJoinsAfterRow = 600
const agentJoinInterval = 350
const outroFadeOut = 900
const outroFadeIn = 1400
const rowsReachedAfter = Math.round(cursorTravelDuration * 0.3)
const agentRowReachedAfter = Math.round(cursorTravelDuration * 0.67)
const rowsLeftAfter = 980
const categoriesStartAfterEditor = 1500
const chipInterval = 200
const categoryCount = 2
const tagCount = 3
const lingerAfterFilling = 1000
const moveBetweenFields = 300
const researchClickAfterEditor = 3800
const researchCursorTravel = travelTime('row', 'research')
const researchClickDuration = 220
const panelOpensAfterClick = 100
const decisionCursorTravel = travelTime('research', 'decision')
const decisionClickDuration = 220
const decisionAnsweredAfterClick = 150
const tagsStartAfterArriving = 500
const editorCursorTravel = travelTime('decision', 'editor')
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

const keystrokeDelays = Array.from(prompt, () => askKeystroke)
const typingEndsAt = keystrokeDelays.reduce((at, delay) => at + delay, typingStartsAt)
const sendAt = typingEndsAt + pauseBeforeSend
const dialogClosesAt = sendAt + sendPressDuration
const cursorShownAt = dialogClosesAt + dialogCloseDuration + cursorDelayAfterRow
const cursorArrivesAt = cursorShownAt + cursorTravelDuration
const clickAt = cursorArrivesAt + rowHoverDuration
const clickEndsAt = clickAt + clickDuration
const editorOpensAt = clickAt + editorOpensAfterClick

export type DialogState = 'closed' | 'open' | 'closing'
export type Shortcut = 'open-agents' | 'send'
export type CursorState = 'resting' | 'moving' | 'hovering' | 'clicking' | 'dragging' | 'still'
export type View = 'table' | 'editor'
export type CursorShape = 'arrow' | 'pointer' | 'text'
/** Einar's cover image: untouched, the skill starting, the image developing, or finished. */
export type CoverState = 'idle' | 'starting' | 'generating' | 'done'

/** Everything the preview shows at one moment. */
export type Frame = {
  shortcut: Shortcut | undefined
  dialog: DialogState
  typed: number
  sendPressed: boolean
  agentRow: boolean
  rowAgents: number
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
  cursorBend: number
  cursorDriftX: number
  cursorDriftY: number
  cursorBusy: boolean
  researchHovered: boolean
  researchPanelOpen: boolean
  cover: CoverState
  editorScroll: number
  bodyElapsed: number | null
  seoElapsed: number | null
  socialImage: CoverState
  previewElapsed: number | null
  confetti: { elapsed: number; entry: PublishedEntry } | null
  outroElapsed: number | null
  outroOpacity: number
}

/** The still frame shown when motion is reduced. */
export const stillFrame: Frame = {
  shortcut: undefined,
  dialog: 'closed',
  typed: 0,
  sendPressed: false,
  agentRow: true,
  rowAgents: rowAgentCount,
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
  cursorBend: 0,
  cursorDriftX: 0,
  cursorDriftY: 0,
  cursorBusy: false,
  researchHovered: false,
  researchPanelOpen: false,
  cover: 'idle',
  editorScroll: 0,
  bodyElapsed: null,
  seoElapsed: null,
  socialImage: 'idle',
  previewElapsed: null,
  confetti: null,
  outroElapsed: null,
  outroOpacity: 0,
}

function chipsArrivedEvery(sinceFirst: number, interval: number, total: number) {
  if (sinceFirst < 0) return 0
  return Math.min(total, Math.floor(sinceFirst / interval) + 1)
}

function chipsArrived(sinceFirst: number, total: number) {
  return chipsArrivedEvery(sinceFirst, chipInterval, total)
}

const researchCursorArrivesAfterEditor = researchClickAfterEditor - pressDelay
const researchCursorMovesAfterEditor = researchCursorArrivesAfterEditor - researchCursorTravel
const researchClickEndsAfterEditor = researchClickAfterEditor + researchClickDuration
const researchPanelOpensAfterEditor = researchClickAfterEditor + panelOpensAfterClick
const decisionClickAfterEditor = docsDecisionAnsweredAt - decisionAnsweredAfterClick
const decisionCursorArrivesAfterEditor = decisionClickAfterEditor - pressDelay
const decisionCursorMovesAfterEditor = decisionCursorArrivesAfterEditor - decisionCursorTravel
const decisionClickEndsAfterEditor = decisionClickAfterEditor + decisionClickDuration
const researchDoneAfterEditor = researchLog.at(-1)?.at ?? 0
const scrollLeadInDuringTravel = Math.round(editorCursorTravel * 0.2)
const editorCursorMovesAfterEditor = Math.max(
  decisionClickEndsAfterEditor,
  researchDoneAfterEditor + 350 - scrollLeadInDuringTravel,
)
const editorCursorArrivesAfterEditor = editorCursorMovesAfterEditor + editorCursorTravel
const scrollAfterEditor = editorCursorMovesAfterEditor + scrollLeadInDuringTravel
const seoStartsAfterEditor = scrollAfterEditor + seoStartsAfterScroll
const bodyDoneAfterEditor = researchDoneAfterEditor + bodyDraftDuration
const socialImageGeneratingAfterEditor = scrollAfterEditor + 300
const socialImageDoneAfterEditor = seoStartsAfterEditor + seoTiming.metaTitleTyped
const previewCursorTravel = travelTime('editor', 'preview')
const previewCursorMovesAfterEditor = Math.max(
  socialImageDoneAfterEditor,
  bodyDoneAfterEditor + 300,
)
const previewCursorArrivesAfterEditor = previewCursorMovesAfterEditor + previewCursorTravel
const previewClickAfterEditor = previewCursorArrivesAfterEditor + pressDelay
const previewClickEndsAfterEditor = previewClickAfterEditor + clickDuration

const editorDuration = previewClickEndsAfterEditor + askTiming.ends
const editorClosesAt = editorOpensAt + editorDuration

/** Length of one loop of the product preview, in milliseconds. */
export const loopDuration = editorClosesAt + restAfterEditor

const askAt = editorOpensAt + previewClickEndsAfterEditor
const outroStartsAt = askAt + askTiming.outroStarts

const cursorMoves: readonly {
  at: number
  from: CursorTarget
  to: CursorTarget
  duration?: number
  bend?: number
}[] = [
  { at: cursorShownAt, from: 'rest', to: 'row' },
  { at: editorOpensAt + researchCursorMovesAfterEditor, from: 'row', to: 'research' },
  { at: editorOpensAt + decisionCursorMovesAfterEditor, from: 'research', to: 'decision' },
  { at: editorOpensAt + editorCursorMovesAfterEditor, from: 'decision', to: 'editor' },
  { at: editorOpensAt + previewCursorMovesAfterEditor, from: 'editor', to: 'preview' },
  {
    at: askAt + askTiming.pageMoveStarts,
    from: 'preview',
    to: 'site-page',
    duration: askTiming.pageReached - askTiming.pageMoveStarts,
  },
  {
    at: askAt + askTiming.lineMoveStarts,
    from: 'site-page',
    to: 'line-start',
    duration: askTiming.lineReached - askTiming.lineMoveStarts,
  },
  {
    at: askAt + askTiming.selectStarts,
    from: 'line-start',
    to: 'line-end',
    duration: askTiming.selectEnds - askTiming.selectStarts,
    bend: 0,
  },
  {
    at: askAt + askTiming.readMoveStarts,
    from: 'line-end',
    to: 'site-read',
    duration: askTiming.readReached - askTiming.readMoveStarts,
  },
  {
    at: askAt + askTiming.referenceMoveStarts,
    from: 'site-read',
    to: 'reference',
    duration: askTiming.referenceReached - askTiming.referenceMoveStarts,
  },
  {
    at: askAt + askTiming.publishMoveStarts,
    from: 'reference',
    to: 'publish',
    duration: askTiming.publishReached - askTiming.publishMoveStarts,
  },
  {
    at: askAt + askTiming.bellMoveStarts,
    from: 'publish',
    to: 'bell',
    duration: askTiming.bellReached - askTiming.bellMoveStarts,
  },
  {
    at: askAt + askTiming.notificationPreviewMoveStarts,
    from: 'bell',
    to: 'notification-preview',
    duration: askTiming.notificationPreviewReached - askTiming.notificationPreviewMoveStarts,
  },
  {
    at: askAt + askTiming.docsReadMoveStarts,
    from: 'notification-preview',
    to: 'docs-read',
    duration: askTiming.docsReadReached - askTiming.docsReadMoveStarts,
  },
  {
    at: askAt + askTiming.docsPublishMoveStarts,
    from: 'docs-read',
    to: 'docs-publish',
    duration: askTiming.docsPublishReached - askTiming.docsPublishMoveStarts,
  },
  { at: editorClosesAt, from: 'docs-publish', to: 'rest', duration: 200 },
]

const driftStartsAfterArrival = 650
const driftSettlesBeforeMove = 150
const driftGlide = 650
const busyMargin = 120
const shortestWander = 1200
const twoStopWander = 3000

const busyWindows = cursorBusyWindows.map(
  ([start, end]) => [askAt + start - busyMargin, askAt + end + busyMargin] as const,
)

function cursorBusyAt(elapsed: number) {
  return busyWindows.some(([start, end]) => elapsed >= start && elapsed < end)
}

function freeSpanAround(elapsed: number, from: number, to: number) {
  let start = from
  let end = to
  for (const [busyStart, busyEnd] of busyWindows) {
    if (busyEnd <= from || busyStart >= to) continue
    if (busyEnd <= elapsed) start = Math.max(start, busyEnd)
    else if (busyStart > elapsed) end = Math.min(end, busyStart)
    else return null
  }
  return elapsed >= start && elapsed < end ? { start, end } : null
}

function seeded(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453
  return value - Math.floor(value)
}

function eased(t: number) {
  const clamped = Math.max(0, Math.min(1, t))
  return clamped * clamped * (3 - 2 * clamped)
}

function wanderStops(target: CursorTarget, span: { start: number; end: number }) {
  const spot = cursorSpots[target]
  const count = span.end - span.start >= twoStopWander ? 2 : 1
  const stops: { x: number; y: number }[] = []
  for (let index = 0; index < count; index += 1) {
    const angle = seeded(span.start + index * 7.1) * Math.PI * 2
    const reach = 50 + seeded(span.start + index * 3.3) * 50
    stops.push({
      x: Math.max(40 - spot.left, Math.min(1240 - spot.left, Math.cos(angle) * reach)),
      y: Math.max(70 - spot.top, Math.min(700 - spot.top, Math.sin(angle) * reach * 0.7)),
    })
  }
  return stops
}

function cursorDriftAt(elapsed: number) {
  const index = cursorMoves.findLastIndex((move) => elapsed >= move.at)
  const move = cursorMoves[index]
  if (!move) return { x: 0, y: 0 }
  const arrival = move.at + (move.duration ?? travelTime(move.from, move.to))
  const nextMoveAt = cursorMoves[index + 1]?.at ?? loopDuration
  const span = freeSpanAround(
    elapsed,
    arrival + driftStartsAfterArrival,
    nextMoveAt - driftSettlesBeforeMove,
  )
  if (!span || span.end - span.start < shortestWander) return { x: 0, y: 0 }
  const path = [{ x: 0, y: 0 }, ...wanderStops(move.to, span), { x: 0, y: 0 }]
  const legs = path.length - 1
  const pause = (span.end - span.start - legs * driftGlide) / legs
  let at = span.start
  for (let leg = 0; leg < legs; leg += 1) {
    const from = path[leg] ?? { x: 0, y: 0 }
    const to = path[leg + 1] ?? { x: 0, y: 0 }
    if (elapsed < at + driftGlide) {
      const t = eased((elapsed - at) / driftGlide)
      return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }
    }
    at += driftGlide
    if (elapsed < at + pause) return to
    at += pause
  }
  return { x: 0, y: 0 }
}

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
  if (sinceEditor < editorCursorMovesAfterEditor) return 'still'
  if (sinceEditor < editorCursorArrivesAfterEditor) return 'moving'
  if (sinceEditor < previewCursorMovesAfterEditor) return 'still'
  if (sinceEditor < previewCursorArrivesAfterEditor) return 'moving'
  if (sinceEditor < previewClickAfterEditor) return 'hovering'
  if (sinceEditor < previewClickEndsAfterEditor) return 'clicking'
  return askCursorAt(sinceEditor - previewClickEndsAfterEditor)
}

function askCursorAt(sincePreview: number): CursorState {
  const t = askTiming
  if (askCursorPressed(sincePreview)) return 'clicking'
  if (sincePreview >= t.selectStarts && sincePreview < t.selectEnds) return 'dragging'
  const moving =
    (sincePreview >= t.pageMoveStarts && sincePreview < t.pageReached) ||
    (sincePreview >= t.lineMoveStarts && sincePreview < t.lineReached) ||
    (sincePreview >= t.readMoveStarts && sincePreview < t.readReached) ||
    (sincePreview >= t.referenceMoveStarts && sincePreview < t.referenceReached) ||
    (sincePreview >= t.publishMoveStarts && sincePreview < t.publishReached) ||
    (sincePreview >= t.bellMoveStarts && sincePreview < t.bellReached) ||
    (sincePreview >= t.notificationPreviewMoveStarts &&
      sincePreview < t.notificationPreviewReached) ||
    (sincePreview >= t.docsReadMoveStarts && sincePreview < t.docsReadReached) ||
    (sincePreview >= t.docsPublishMoveStarts && sincePreview < t.docsPublishReached)
  if (moving) return 'moving'
  const hovering =
    (sincePreview >= t.lineReached && sincePreview < t.selectStarts) ||
    (sincePreview >= t.referenceReached && sincePreview < t.referenceClicked) ||
    (sincePreview >= t.publishReached && sincePreview < t.publishClicked) ||
    (sincePreview >= t.bellReached && sincePreview < t.bellClicked) ||
    (sincePreview >= t.notificationPreviewReached && sincePreview < t.notificationPreviewClicked) ||
    (sincePreview >= t.docsPublishReached && sincePreview < t.docsPublishClicked)
  return hovering ? 'hovering' : 'still'
}

function askCursorShape(sincePreview: number): CursorShape | undefined {
  const t = askTiming
  if (sincePreview >= t.lineReached - 150 && sincePreview < t.selectEnds + 100) return 'text'
  if (sincePreview >= t.referenceReached - 100 && sincePreview < t.referenceClicked + 300)
    return 'pointer'
  if (sincePreview >= t.publishReached - 100 && sincePreview < t.publishClicked + 300)
    return 'pointer'
  if (sincePreview >= t.bellReached - 100 && sincePreview < t.notificationPreviewClicked + 300)
    return 'pointer'
  if (sincePreview >= t.docsPublishReached - 100 && sincePreview < t.docsPublishClicked + 300)
    return 'pointer'
  return undefined
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
  const cursorDrift = cursorDriftAt(elapsed)
  const askShape =
    inEditor && sinceEditor >= previewClickEndsAfterEditor
      ? askCursorShape(sinceEditor - previewClickEndsAfterEditor)
      : undefined
  const dialog: DialogState =
    elapsed >= dialogOpensAt && elapsed < dialogClosesAt
      ? 'open'
      : elapsed >= dialogClosesAt && elapsed < dialogClosesAt + dialogCloseDuration
        ? 'closing'
        : 'closed'
  const shortcut: Shortcut | undefined =
    elapsed >= shortcutShownAt && elapsed < shortcutHiddenAt
      ? 'open-agents'
      : (elapsed >= sendAt - 60 && elapsed < sendAt + enterChipDuration) ||
          (elapsed >= askAt + askTiming.enterPressed - 60 &&
            elapsed < askAt + askTiming.enterPressed + enterChipDuration)
        ? 'send'
        : undefined
  return {
    shortcut,
    dialog,
    typed: typedAt(elapsed),
    sendPressed: elapsed >= sendAt && elapsed < dialogClosesAt,
    agentRow: elapsed >= dialogClosesAt && elapsed < editorClosesAt,
    rowAgents:
      elapsed < dialogClosesAt + firstAgentJoinsAfterRow
        ? 1
        : Math.min(
            rowAgentCount,
            2 +
              Math.floor((elapsed - dialogClosesAt - firstAgentJoinsAfterRow) / agentJoinInterval),
          ),
    cursorShape:
      askShape ??
      ((elapsed >= cursorShownAt + rowsReachedAfter && elapsed < clickEndsAt) ||
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
        : 'arrow'),
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
    cursorProgress: cursorMove
      ? motionProgress(
          elapsed - cursorMove.at,
          cursorMove.duration ?? travelTime(cursorMove.from, cursorMove.to),
        )
      : 1,
    cursorBend: cursorMove ? (cursorMove.bend ?? arcFor(cursorMove.from, cursorMove.to)) : 0,
    cursorDriftX: cursorDrift.x,
    cursorDriftY: cursorDrift.y,
    cursorBusy: cursorBusyAt(elapsed),
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
    outroElapsed: elapsed >= outroStartsAt ? elapsed - outroStartsAt : null,
    outroOpacity:
      elapsed >= outroStartsAt
        ? Math.min(
            motionProgress(elapsed - outroStartsAt, outroFadeIn),
            Math.max(0, Math.min(1, (loopDuration - elapsed) / outroFadeOut)),
          )
        : 0,
    confetti:
      inEditor && sinceEditor >= previewClickEndsAfterEditor
        ? confettiAt(sinceEditor - previewClickEndsAfterEditor)
        : null,
    previewElapsed:
      inEditor && sinceEditor >= previewClickEndsAfterEditor
        ? sinceEditor - previewClickEndsAfterEditor
        : null,
  }
}
