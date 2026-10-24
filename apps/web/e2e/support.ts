import process from 'node:process'
import { test as base, expect, type Page } from '@playwright/test'
import type { Scenario } from './fixtures'

function runtimeMessage(error: string) {
  const [firstLine = ''] = error.split(/\n|\\n/, 1)
  return firstLine.replace(/^Error: /, '')
}

export const test = base.extend<{ runtimeEvidence: void; expectedRuntimeErrors: string[] }>({
  expectedRuntimeErrors: [[], { option: true }],
  runtimeEvidence: [
    async ({ page, expectedRuntimeErrors }, use, info) => {
      for (const expected of expectedRuntimeErrors) {
        expect(
          expected.trim().length,
          'Expected runtime error must name a specific failure',
        ).toBeGreaterThan(0)
      }
      const errors: string[] = []
      const network: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text())
      })
      page.on('response', (response) => {
        if (
          new URL(response.url()).origin === new URL(page.url()).origin &&
          response.status() >= 400
        )
          network.push(`${response.status()} ${response.url()}`)
      })
      page.on('requestfailed', (request) => {
        if (
          ['script', 'stylesheet', 'font', 'image'].includes(request.resourceType()) &&
          request.failure()?.errorText !== 'net::ERR_ABORTED'
        )
          network.push(`${request.failure()?.errorText} ${request.url()}`)
      })
      await use()
      await info.attach('browser-environment', {
        body: JSON.stringify({
          viewport: page.viewportSize(),
          url: page.url(),
          browser: page.context().browser()?.version(),
          theme: await page
            .evaluate(() =>
              document.documentElement.classList.contains('dark') ? 'dark' : 'light',
            )
            .catch(() => null),
          errors,
          expectedRuntimeErrors,
          network,
        }),
        contentType: 'application/json',
      })
      for (const expected of expectedRuntimeErrors) {
        expect(
          errors.some((error) => runtimeMessage(error) === expected),
          `Observed ${expected}`,
        ).toBe(true)
      }
      expect(
        errors.filter((error) => !expectedRuntimeErrors.includes(runtimeMessage(error))),
        'Unexpected local application runtime/console errors',
      ).toEqual([])
      expect(network, 'Required local assets must load').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

export async function visit(page: Page, scenario: Scenario = 'normal', pathname = '/dash') {
  const origin = scenario === 'normal' ? process.env.WEB_ORIGIN : process.env.WEB_FIXTURE_ORIGIN
  if (!origin) throw new Error('Browser origin missing; use vp run test-web:e2e')
  test.info().annotations.push({ type: 'scenario', description: scenario })
  const url = new URL(pathname, origin)
  if (scenario !== 'normal') url.searchParams.set('scenario', scenario)
  await page.goto(url.href)
  await expect(page.getByRole('main')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Aircastle', exact: true })).toBeVisible()
}

export function visibleSidebarTrigger(page: Page) {
  return page
    .getByRole('button', { name: 'Toggle Sidebar', exact: true, includeHidden: true })
    .filter({ visible: true })
}

export async function assertLayout(page: Page) {
  const width = page.viewportSize()!.width
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
    'Document must fit viewport',
  ).toBeLessThanOrEqual(width + 1)
  const controls = [
    page.getByRole('button', { name: /^Switch project:/, includeHidden: true }),
    page.getByRole('button', { name: 'Search pages', exact: true, includeHidden: true }),
    page.getByRole('button', { name: 'Choose theme', exact: true, includeHidden: true }),
    page.getByRole('button', { name: 'Open account menu', exact: true, includeHidden: true }),
    visibleSidebarTrigger(page),
  ]
  const boxes = []
  for (const control of controls) {
    await expect(control).toBeVisible()
    const box = await control.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x, 'Control left edge').toBeGreaterThanOrEqual(-1)
    expect(box!.x + box!.width, 'Control right edge').toBeLessThanOrEqual(width + 1)
    expect(box!.y).toBeGreaterThanOrEqual(-1)
    expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1)
    boxes.push(box!)
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!
      const b = boxes[j]!
      const overlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
      const vertical = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
      expect(overlap <= 1 || vertical <= 1, 'Essential controls must not overlap').toBe(true)
    }
  }
  for (const popup of await page
    .locator('[role="dialog"], [data-slot="popover-content"], [role="menu"]')
    .all()) {
    if (!(await popup.isVisible())) continue
    const box = await popup.boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(-1)
    expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1)
  }
}
