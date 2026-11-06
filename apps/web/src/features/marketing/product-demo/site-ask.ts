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
const readMoveStarts = sent + 250
const readReached = sent + 850
const readBurstDuration = 650
const readSteps = [0.3, 0.25, 0.25, 0.2] as const
const readBursts = readSteps.map((step, index) => ({ at: sent + 700 + index * 1050, step }))
const readEnds = (readBursts.at(-1)?.at ?? sent) + readBurstDuration
const referenceMoveStarts = readEnds + 250
const referenceReached = referenceMoveStarts + 900
const referenceClicked = referenceReached + 250
const jumpStarts = referenceClicked + 120
const jumpDuration = 900
const jumpEnds = jumpStarts + jumpDuration
const flashDuration = 1200
const publishMoveStarts = jumpEnds + 700
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
  readMoveStarts,
  readReached,
  referenceMoveStarts,
  referenceReached,
  referenceClicked,
  publishMoveStarts,
  publishReached,
  publishClicked,
  ends: publishClicked + confettiDuration + 400,
} as const

const clickDuration = 220

/** Whether the cursor is pressing Ask Air's send button, the reference in Air's reply, or Publish. */
export function askCursorPressed(elapsed: number) {
  return [sendClicked, referenceClicked, publishClicked].some(
    (clicked) => elapsed >= clicked && elapsed < clicked + clickDuration,
  )
}

/** Whether the cursor has clicked Publish. */
export function publishedAt(elapsed: number) {
  return elapsed >= publishClicked
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

/** Where the site is scrolled: `opening` runs 0 to 1 down to the opening line, then `end` runs 0 to 1 on from there to the bottom of the post. */
export function siteScrollAt(elapsed: number) {
  const down = eased(elapsed - scrollStarts, scrollDownDuration) * overshoot
  const back = eased(elapsed - scrollBackStarts, scrollBackDuration) * (overshoot - 1)
  const read = readBursts.reduce(
    (total, burst) => total + eased(elapsed - burst.at, readBurstDuration) * burst.step,
    0,
  )
  return { opening: down - back, end: read - eased(elapsed - jumpStarts, jumpDuration) }
}

/** How strongly the revised line is tinted after the reference jumps to it, from 1 fading to 0. */
export function revisedFlashAt(elapsed: number) {
  if (elapsed < jumpEnds) return 0
  return Math.max(0, 1 - (elapsed - jumpEnds) / flashDuration)
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
