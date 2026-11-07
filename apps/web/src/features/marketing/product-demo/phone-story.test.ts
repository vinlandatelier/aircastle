import { describe, expect, it } from 'vite-plus/test'
import {
  phoneEditorFieldAt,
  phoneFingerAt,
  phoneFrame,
  phoneReplyToastAt,
  phoneScreenAt,
  phoneSheetAt,
  phoneSiteScrollAt,
  phoneSpots,
} from './phone-story'
import { askTiming } from './site-ask'
import { frameAt, loopDuration, seoTiming } from './timeline'

const step = 10

type Run<T> = { value: T; from: number; to: number }

function runsOf<T>(read: (elapsed: number) => T) {
  const runs: Run<T>[] = []
  for (let elapsed = 0; elapsed < loopDuration; elapsed += step) {
    const value = read(elapsed)
    const last = runs.at(-1)
    if (last && last.value === value) last.to = elapsed + step
    else runs.push({ value, from: elapsed, to: elapsed + step })
  }
  return runs
}

describe('the phone story', () => {
  it('shows the posts, the editor, the live post and the docs page in story order', () => {
    const screens = runsOf((elapsed) => phoneScreenAt(frameAt(elapsed)))
    expect(screens.map((run) => run.value)).toEqual(['posts', 'editor', 'site', 'docs', 'posts'])
    const loopsBackTo = screens.pop()
    screens[0]!.from -= loopsBackTo!.to - loopsBackTo!.from
    for (const run of screens)
      expect(run.to - run.from, `${run.value} stays up long enough to read`).toBeGreaterThan(1500)
  })

  it('raises each sheet over its own screen and holds it long enough to read', () => {
    const sheetScreens = { ask: 'posts', research: 'editor', air: 'site' } as const
    const sheets = runsOf((elapsed) => phoneSheetAt(frameAt(elapsed)))
    const raised = sheets.filter((run) => run.value !== null)
    expect(raised.map((run) => run.value)).toEqual(['ask', 'research', 'air'])
    for (const run of raised) {
      expect(run.to - run.from, `the ${run.value} sheet stays up`).toBeGreaterThan(1500)
      for (let elapsed = run.from; elapsed < run.to; elapsed += step)
        expect(phoneScreenAt(frameAt(elapsed))).toBe(sheetScreens[run.value!])
    }
  })

  it("hands Air's reply to a toast as its sheet lowers, and never shows both", () => {
    const toasts = runsOf((elapsed) => phoneReplyToastAt(frameAt(elapsed))).filter(
      (run) => run.value,
    )
    expect(toasts).toHaveLength(1)
    const [toast] = toasts
    const airSheet = runsOf((elapsed) => phoneSheetAt(frameAt(elapsed))).find(
      (run) => run.value === 'air',
    )
    expect(
      toast!.from - airSheet!.to,
      'the toast waits for the sheet to lower',
    ).toBeGreaterThanOrEqual(350)
    for (let elapsed = toast!.from; elapsed < toast!.to; elapsed += step)
      expect(phoneSheetAt(frameAt(elapsed))).toBeNull()
  })

  it('holds the live post at the opening line while Air works, then reads down', () => {
    expect(phoneSiteScrollAt(askTiming.replied).end).toBe(0)
    expect(phoneSiteScrollAt(askTiming.referenceClicked - 1).end).toBeGreaterThan(0.9)
  })

  it('scrolls the editor to the body as Thorfinn writes, then to SEO while Askeladd works', () => {
    const fields = runsOf((elapsed) => {
      const frame = frameAt(elapsed)
      return phoneScreenAt(frame) === 'editor' ? phoneEditorFieldAt(frame) : null
    }).filter((run) => run.value !== null)
    expect(fields.map((run) => run.value)).toEqual(['top', 'body', 'seo'])
    for (let elapsed = 0; elapsed < loopDuration; elapsed += step) {
      const frame = frameAt(elapsed)
      if (phoneScreenAt(frame) !== 'editor' || frame.seoElapsed === null) continue
      if (frame.seoElapsed >= 0 && frame.seoElapsed < seoTiming.done)
        expect(phoneEditorFieldAt(frame), 'Askeladd is on screen while filling SEO').toBe('seo')
    }
  })

  it('keeps the finger on the screen, clear of its rounded corners, all loop long', () => {
    for (let elapsed = 0; elapsed < loopDuration; elapsed += step) {
      const finger = phoneFingerAt(frameAt(elapsed))
      if (!finger.shown) continue
      expect(finger.left).toBeGreaterThanOrEqual(20)
      expect(finger.left).toBeLessThanOrEqual(phoneFrame.width - 20)
      expect(finger.top).toBeGreaterThanOrEqual(20)
      expect(finger.top).toBeLessThanOrEqual(phoneFrame.height - 20)
    }
  })

  it("lifts the finger while Air's sheet is up, since nothing in it is tapped", () => {
    for (let elapsed = 0; elapsed < loopDuration; elapsed += step) {
      const frame = frameAt(elapsed)
      if (phoneSheetAt(frame) === 'air') expect(phoneFingerAt(frame).shown).toBe(false)
    }
  })

  it('keeps every tap spot on the phone screen, clear of its rounded corners', () => {
    for (const [target, spot] of Object.entries(phoneSpots)) {
      expect(spot.left, `${target} is on screen`).toBeGreaterThanOrEqual(20)
      expect(spot.left, `${target} is on screen`).toBeLessThanOrEqual(phoneFrame.width - 20)
      expect(spot.top, `${target} is on screen`).toBeGreaterThanOrEqual(20)
      expect(spot.top, `${target} is on screen`).toBeLessThanOrEqual(phoneFrame.height - 20)
    }
  })
})
