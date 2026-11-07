import process from 'node:process'
import type { Locator, Page } from '@playwright/test'
import { test, expect } from './support'

const phone = { width: 390, height: 844 }

test.use({
  viewport: phone,
  ...(process.env.WEB_E2E_VIDEO === '1' ? { video: { mode: 'on' as const, size: phone } } : {}),
})

const playbackRate = 1.2

function story(timeline: number) {
  return Math.ceil(timeline / playbackRate)
}

async function box(locator: Locator) {
  const value = await locator.boundingBox()
  if (!value) throw new Error('Element is not laid out')
  return value
}

async function expectInside(inner: Locator, outer: Locator, label: string) {
  const a = await box(inner)
  const b = await box(outer)
  expect(a.x, `${label} starts inside the phone window`).toBeGreaterThanOrEqual(b.x - 1)
  expect(a.x + a.width, `${label} ends inside the phone window`).toBeLessThanOrEqual(
    b.x + b.width + 1,
  )
  expect(a.y).toBeGreaterThanOrEqual(b.y - 1)
  expect(a.y + a.height).toBeLessThanOrEqual(b.y + b.height + 1)
}

async function expectNoSideScroll(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
    'the page never scrolls sideways',
  ).toBeLessThanOrEqual(390)
}

test.describe.configure({ timeout: 90_000 })

test('on a phone, the hero title wraps cleanly and the rotating word never reflows it', async ({
  page,
}) => {
  await page.clock.install({ time: 0 })
  await page.clock.pauseAt(1000)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  const title = page.getByRole('heading', { level: 1 })
  await expect(title).toBeVisible()
  await expectNoSideScroll(page)
  const titleBox = await box(title)
  expect(titleBox.x + titleBox.width).toBeLessThanOrEqual(390 - 12)
  const fontSize = await title.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))
  expect(fontSize, 'a phone-sized title').toBeLessThanOrEqual(36)
  const heights = new Set<number>()
  const slotLines = new Set<number>()
  const words = new Set<string>()
  for (let turn = 0; turn < 5; turn += 1) {
    const now = await title.evaluate(async (element) => {
      const slot = element.querySelector('[aria-hidden="true"] > span')
      if (!slot) throw new Error('No rotating word')
      await Promise.all(
        slot.getAnimations({ subtree: true }).map((animation) => animation.finished),
      )
      return {
        word: slot.textContent ?? '',
        height: Math.round(element.getBoundingClientRect().height),
        slot: Math.round(slot.getBoundingClientRect().top),
      }
    })
    words.add(now.word)
    heights.add(now.height)
    slotLines.add(now.slot)
    await page.clock.runFor(4000)
  }
  expect(words.size, 'every rotating word was measured once settled').toBeGreaterThanOrEqual(4)
  expect(heights.size, 'the title keeps one height as the word rotates').toBe(1)
  expect(slotLines.size, 'the rotating word stays on its line').toBe(1)
  const actions = [
    page.getByRole('main').getByRole('link', { name: 'Get started', exact: true }),
    page.getByRole('main').getByRole('link', { name: 'See Aircastle in action', exact: true }),
  ]
  for (const action of actions) {
    const actionBox = await box(action)
    expect(actionBox.x + actionBox.width).toBeLessThanOrEqual(390)
  }
  const [start, demo] = await Promise.all(actions.map(box))
  if (!start || !demo) throw new Error('Hero actions are not laid out')
  expect(demo.y, 'the demo link sits under Get started').toBeGreaterThan(start.y + start.height - 1)
  expect(Math.abs(demo.x - start.x), 'and lines up with its left edge').toBeLessThan(2)
  const summary = page.getByText(/^Aircastle is the headless CMS/)
  expect(
    parseFloat(await summary.evaluate((element) => getComputedStyle(element).fontSize)),
    'a phone-sized summary',
  ).toBeLessThanOrEqual(18)
  const credit = await box(page.getByText('Presented by'))
  const header = await box(page.getByRole('banner'))
  expect(credit.y - (header.y + header.height), 'the hero starts close to the header').toBeLessThan(
    56,
  )
})

test('on a phone, the preview zooms into a full-height window that follows the same story', async ({
  page,
}) => {
  test.setTimeout(180_000)
  await page.clock.install({ time: 0 })
  await page.clock.pauseAt(1000)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  const stage = page.locator('[data-demo-stage]')
  await stage.scrollIntoViewIfNeeded()
  await expect(stage).toHaveAttribute('data-demo-stage', 'phone')
  await expectNoSideScroll(page)
  const frame = page.locator('[data-demo-frame]')
  const stageBox = await box(stage)
  const zoom = (await box(frame)).width / 1280
  expect(zoom, 'the preview reads at about twice the fitted size').toBeGreaterThan(0.55)
  expect(Math.abs(stageBox.height - 740 * zoom), 'the window shows the full height').toBeLessThan(2)
  const cursor = frame.locator('[data-demo-cursor]')

  await page.clock.runFor(story(2600))
  await expectInside(frame.locator('[data-demo-dialog]'), stage, 'the Ask Air dialog')
  await expect(frame.locator('[data-demo-dialog]')).toContainText('Ask Air')

  const clickOn = async (target: string) => {
    for (let tick = 0; tick < 1200; tick += 1) {
      const state = await cursor.evaluate((element) => ({
        target: element.getAttribute('data-target'),
        state: element.getAttribute('data-state'),
      }))
      if (state.target === target && state.state === 'clicking') return
      await page.clock.runFor(story(state.target === target ? 30 : 120))
    }
    throw new Error(`The cursor never clicked ${target}`)
  }
  for (const [target, label] of [
    ['row', 'the agent row click'],
    ['research', 'the research click'],
    ['preview', 'the Preview click'],
    ['reference', 'the reference click'],
    ['bell', 'the bell click'],
    ['docs-publish', 'the final Publish click'],
  ] as const) {
    await clickOn(target)
    await expectInside(cursor, stage, label)
  }

  const outro = frame.locator('[data-demo-outro]')
  for (let tick = 0; tick < 200 && (await outro.count()) === 0; tick += 1)
    await page.clock.runFor(story(100))
  await page.clock.runFor(story(4000))
  await expectInside(outro.locator('[data-demo-outro-mark]'), stage, 'the closing mark')
  await expectInside(outro.locator('[data-demo-outro-wordmark]'), stage, 'the closing name')
  await expectNoSideScroll(page)
})

test('on a phone, the whole preview story plays through in its window, start to finish', async ({
  page,
}) => {
  test.setTimeout(150_000)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const stage = page.locator('[data-demo-stage]')
  await test.step('scroll down to the preview', async () => {
    await stage.scrollIntoViewIfNeeded()
    await expect(stage).toHaveAttribute('data-demo-stage', 'phone')
  })
  const frame = page.locator('[data-demo-frame]')
  await test.step('Ask Air takes the request', async () => {
    await expect(frame.locator('[data-demo-dialog]')).toBeVisible({ timeout: 10_000 })
  })
  await test.step('the agents open the post in the editor', async () => {
    await expect(frame.locator('[data-demo-editor]')).toHaveAttribute('data-state', 'shown', {
      timeout: 20_000,
    })
  })
  await test.step('the post is previewed on the live site', async () => {
    await expect(frame.locator('[data-demo-site-preview]')).toHaveCount(1, { timeout: 30_000 })
  })
  await test.step('the docs page is previewed and published', async () => {
    await expect(frame.locator('[data-demo-docs-page]')).toBeVisible({ timeout: 40_000 })
  })
  await test.step('the closing card names Aircastle', async () => {
    const wordmark = frame.locator('[data-demo-outro-wordmark]')
    await expect(wordmark).toBeVisible({ timeout: 30_000 })
    await expect
      .poll(() => wordmark.evaluate((element) => Number(getComputedStyle(element).opacity)), {
        timeout: 10_000,
      })
      .toBe(1)
    const name = await box(wordmark)
    const window = await box(stage)
    expect(name.x).toBeGreaterThanOrEqual(window.x)
    expect(name.x + name.width).toBeLessThanOrEqual(window.x + window.width)
  })
  await expectNoSideScroll(page)
})
