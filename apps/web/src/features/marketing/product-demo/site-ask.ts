import { openingLine, rewrittenLine } from './body-draft'

/** What the user types into Ask Air after selecting the opening line. */
export const askInstruction = 'Lead with what a team can do with it'

const keystroke = 26
const rewriteWordInterval = 35
const rewrittenWords = rewrittenLine.split(' ')

const scrollStarts = 800
const lineReached = 1800
const selectStarts = 1950
const selectEnds = 2650
const dropdownOpens = 2800
const inputReached = 3400
const inputClicked = 3500
const typingStarts = 3780
const typingEnds = typingStarts + askInstruction.length * keystroke
const sendReached = typingEnds + 380
const sendClicked = sendReached + 120
const sent = sendClicked + 220
const thinkingEnds = sent + 650
const reviewNoted = thinkingEnds + 300
const rewriteStarts = reviewNoted + 450
const rewriteEnds = rewriteStarts + rewrittenWords.length * rewriteWordInterval
const approved = rewriteEnds + 300
const finished = approved + 300
const replied = finished + 250

/** When each beat of the select-to-prompt scene happens, in milliseconds after the site preview opens. */
export const askTiming = {
  scrollStarts,
  scrollDuration: 1000,
  lineMoveStarts: scrollStarts + 100,
  lineReached,
  selectStarts,
  selectEnds,
  dropdownOpens,
  inputMoveStarts: dropdownOpens + 100,
  inputReached,
  inputClicked,
  typingStarts,
  sendMoveStarts: typingEnds + 80,
  sendReached,
  sendClicked,
  sent,
  thinkingEnds,
  reviewNoted,
  rewriteStarts,
  rewriteEnds,
  approved,
  finished,
  replied,
  ends: replied + 2200,
} as const

const clickDuration = 220

/** Whether the cursor is pressing during the scene, for the click and drag beats. */
export function askCursorPressed(elapsed: number) {
  return (
    (elapsed >= inputClicked && elapsed < inputClicked + clickDuration) ||
    (elapsed >= sendClicked && elapsed < sendClicked + clickDuration)
  )
}

function eased(elapsed: number, duration: number) {
  const t = Math.max(0, Math.min(1, elapsed / duration))
  return t * t * t * (t * (6 * t - 15) + 10)
}

/** How far the site has scrolled down to the opening line, from 0 to 1. */
export function siteScrollAt(elapsed: number) {
  return eased(elapsed - scrollStarts, askTiming.scrollDuration)
}

/** How many characters of the opening line are selected, or 0 once the rewrite replaces it. */
export function selectedCharsAt(elapsed: number) {
  if (elapsed < selectStarts || elapsed >= rewriteStarts) return 0
  return Math.round(openingLine.length * eased(elapsed - selectStarts, selectEnds - selectStarts))
}

/** Whether the Ask Air dropdown is open under the selection. */
export function askOpenAt(elapsed: number) {
  return elapsed >= dropdownOpens && elapsed < sent
}

/** How many characters of the instruction the user has typed. */
export function askTypedAt(elapsed: number) {
  if (elapsed < typingStarts) return 0
  return Math.min(askInstruction.length, Math.floor((elapsed - typingStarts) / keystroke) + 1)
}

/** The rewritten opening line's words that have streamed in, or null before the rewrite starts. */
export function rewrittenWordsAt(elapsed: number) {
  if (elapsed < rewriteStarts) return null
  return rewrittenWords.slice(
    0,
    Math.min(
      rewrittenWords.length,
      Math.floor((elapsed - rewriteStarts) / rewriteWordInterval) + 1,
    ),
  )
}
