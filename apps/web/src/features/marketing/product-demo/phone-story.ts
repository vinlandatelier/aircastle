import { cursorPosition, type CursorTarget } from './cursor-path'
import { researchLog } from './research'
import { askTiming, docsPreviewAt, siteScrollAt } from './site-ask'
import type { Frame } from './timeline'

/** The screen the phone preview shows, one per beat of the story. */
export type PhoneScreen = 'posts' | 'editor' | 'site' | 'docs'

/** A sheet that rises over the phone screen: Ask Air, Canute's research, or Air's thread. */
export type PhoneSheet = 'ask' | 'research' | 'air'

const airSheetLingers = 900
const sheetLowers = 400
const readDownDuration = 1100
const toastLingersAfterJump = 900

/** Which screen the phone shows for this frame of the story. */
export function phoneScreenAt(frame: Frame): PhoneScreen {
  if (frame.view === 'table') return 'posts'
  if (frame.previewElapsed === null) return 'editor'
  return docsPreviewAt(frame.previewElapsed) === null ? 'site' : 'docs'
}

/** Which sheet, if any, is raised over the phone screen. */
export function phoneSheetAt(frame: Frame): PhoneSheet | null {
  if (frame.dialog !== 'closed') return 'ask'
  const screen = phoneScreenAt(frame)
  if (screen === 'editor' && frame.researchPanelOpen && frame.researchSteps < researchLog.length)
    return 'research'
  const elapsed = frame.previewElapsed
  if (
    screen === 'site' &&
    elapsed !== null &&
    elapsed >= askTiming.sent &&
    elapsed < askTiming.replied + airSheetLingers
  )
    return 'air'
  return null
}

/** Whether Air's reply sits as a toast at the foot of the site, with the reference to tap. */
export function phoneReplyToastAt(frame: Frame) {
  const elapsed = frame.previewElapsed
  return (
    phoneScreenAt(frame) === 'site' &&
    elapsed !== null &&
    elapsed >= askTiming.replied + airSheetLingers + sheetLowers &&
    elapsed < askTiming.referenceClicked + toastLingersAfterJump
  )
}

function eased(t: number) {
  const clamped = Math.max(0, Math.min(1, t))
  return clamped * clamped * (3 - 2 * clamped)
}

/** How far the live site has scrolled on the phone: it waits at the opening line while Air's thread is up, reads down once Air replies, then jumps back like the desktop. */
export function phoneSiteScrollAt(elapsed: number) {
  const desktop = siteScrollAt(elapsed)
  const readFrom = askTiming.replied + airSheetLingers
  if (elapsed < readFrom) return { opening: desktop.opening, end: 0 }
  if (elapsed < askTiming.referenceClicked)
    return { opening: desktop.opening, end: eased((elapsed - readFrom) / readDownDuration) }
  return desktop
}

/** Which editor field the phone scrolls to: the body while Thorfinn starts writing, then the SEO fields once Askeladd starts. */
export function phoneEditorFieldAt(frame: Frame): 'top' | 'body' | 'seo' {
  if (frame.bodyElapsed === null) return 'top'
  return frame.seoElapsed !== null && frame.seoElapsed >= 0 ? 'seo' : 'body'
}

const tapScreens: Partial<Record<CursorTarget, PhoneScreen>> = {
  row: 'posts',
  research: 'editor',
  decision: 'editor',
  preview: 'editor',
  reference: 'site',
  publish: 'site',
  bell: 'site',
  'notification-preview': 'site',
  'docs-publish': 'docs',
}

/** A touch on the phone screen: a tap on a control, or a held press that selects the opening line. */
export type PhoneTouch = {
  kind: 'tap' | 'press'
  target: CursorTarget
  left: number
  top: number
}

/** The touch on the phone screen, if any. Phones have no pointer, so nothing hovers or glides: a tap shows on the control as it is pressed, and a press shows only while it selects text. */
export function phoneTouchAt(frame: Frame): PhoneTouch | null {
  const target = frame.cursorTarget
  const holding = frame.cursor === 'hovering' && target === 'line-start'
  if (frame.cursor === 'dragging' || holding) {
    const { left, top } = cursorPosition({
      spots: phoneSpots,
      from: frame.cursorFrom,
      target,
      progress: frame.cursorProgress,
      curve: frame.cursorBend,
      drift: { x: 0, y: 0 },
    })
    return { kind: 'press', target, left, top }
  }
  const pressed = frame.cursor === 'clicking' || frame.cursor === 'still'
  const onScreen = tapScreens[target] === phoneScreenAt(frame)
  if (!pressed || frame.cursorProgress < 1 || !onScreen) return null
  return { kind: 'tap', target, ...phoneSpots[target] }
}

/** The phone preview's size in its own pixels, before it is scaled to the stage. */
export const phoneFrame = { width: 390, height: 780 } as const

/** Where each cursor target sits on the phone, in phone pixels. */
export const phoneSpots: Readonly<Record<CursorTarget, { left: number; top: number }>> = {
  rest: { left: 300, top: 690 },
  row: { left: 160, top: 186 },
  research: { left: 150, top: 154 },
  decision: { left: 207, top: 581 },
  editor: { left: 290, top: 560 },
  preview: { left: 330, top: 106 },
  'site-page': { left: 220, top: 520 },
  'line-start': { left: 24, top: 219 },
  'line-end': { left: 68, top: 275 },
  'site-read': { left: 230, top: 560 },
  reference: { left: 195, top: 735 },
  publish: { left: 336, top: 106 },
  bell: { left: 323, top: 57 },
  'notification-preview': { left: 215, top: 247 },
  'docs-read': { left: 220, top: 520 },
  'docs-publish': { left: 336, top: 106 },
}
