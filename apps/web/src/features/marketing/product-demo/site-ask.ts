import { openingLine, rewrittenLine } from './body-draft'

/** What the user types into Ask Air after selecting the opening line. */
export const askInstruction = 'hm maybe lead with what a team can do with it'

const keystroke = 26
const rewriteWordInterval = 35
const rewrittenWords = rewrittenLine.split(' ')

const pageReached = 1300
const scrollStarts = 1100
const scrollDownDuration = 1200
const overshoot = 1.6
const scrollBackStarts = 2650
const scrollBackDuration = 650
const lineMoveStarts = 3300
const lineReached = 3900
const selectStarts = 4050
const selectEnds = 4750
const dropdownOpens = 4900
const typingStarts = dropdownOpens + 350
const inkDuration = 380
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
const publishMoveStarts = replied + 1100
const publishReached = publishMoveStarts + 900
const publishClicked = publishReached + 250
const confettiDuration = 2000

/** When each beat of the select-to-prompt scene happens, in milliseconds after the site preview opens. */
export const askTiming = {
  pageMoveStarts: 700,
  pageReached,
  lineMoveStarts,
  lineReached,
  selectStarts,
  selectEnds,
  dropdownOpens,
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
  publishMoveStarts,
  publishReached,
  publishClicked,
  ends: publishClicked + confettiDuration + 400,
} as const

const clickDuration = 220

/** Whether the cursor is pressing Ask Air's send button or Publish. */
export function askCursorPressed(elapsed: number) {
  return [sendClicked, publishClicked].some(
    (clicked) => elapsed >= clicked && elapsed < clicked + clickDuration,
  )
}

/** Milliseconds since Publish was clicked while its confetti is in the air, or null. */
export function confettiAt(elapsed: number) {
  const since = elapsed - publishClicked
  return since >= 0 && since < confettiDuration ? since : null
}

function eased(elapsed: number, duration: number) {
  const t = Math.max(0, Math.min(1, elapsed / duration))
  return t * t * t * (t * (6 * t - 15) + 10)
}

/** How far the site has scrolled down to the opening line, from 0 to 1. */
export function siteScrollAt(elapsed: number) {
  const down = eased(elapsed - scrollStarts, scrollDownDuration) * overshoot
  const back = eased(elapsed - scrollBackStarts, scrollBackDuration) * (overshoot - 1)
  return down - back
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

/** The rewritten opening line's words that have streamed in, each with how far it has inked in from 0 to 1, or null before the rewrite starts. */
export function rewrittenWordsAt(elapsed: number) {
  if (elapsed < rewriteStarts) return null
  return rewrittenWords
    .map((word, index) => ({
      word,
      ink: Math.min(1, (elapsed - rewriteStarts - index * rewriteWordInterval) / inkDuration),
    }))
    .filter(({ ink }) => ink >= 0)
}
