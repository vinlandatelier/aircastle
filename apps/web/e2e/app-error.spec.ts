import type { Page } from '@playwright/test'
import { fixtureTest as test, expect } from './support'
import { themeStorageKey } from '../src/theme'

type Fault = 'runtime' | 'rejection'

const faultMarker = (fault: Fault) => `Aircastle verification ${fault} failure: private details`

async function failAfterStartup(page: Page, fault: Fault) {
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await page.evaluate(
    ({ fault, marker }) => {
      setTimeout(() => {
        if (fault === 'runtime') throw new Error(marker)
        void Promise.reject(new Error(marker))
      }, 0)
    },
    { fault, marker: faultMarker(fault) },
  )
}

for (const fault of ['runtime', 'rejection'] as const) {
  test.describe(`${fault} failure recovery`, () => {
    const marker = faultMarker(fault)
    test.use({ expectedRuntimeErrors: [marker] })

    test('unexpected failures show safe recovery and retry the original page', async ({ page }) => {
      await page.goto('/sign-in')
      await failAfterStartup(page, fault)
      await expect(
        page.getByRole('heading', { name: 'Something went wrong', exact: true }),
      ).toBeVisible()
      await expect(page).toHaveTitle('Aircastle - Something went wrong')
      await expect(page.locator('head title')).toHaveCount(1)
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
      await expect(page.locator('body')).not.toContainText(marker)
      await expect(page.getByRole('link', { name: 'Back to home', exact: true })).toHaveAttribute(
        'href',
        '/',
      )
      await page.getByRole('button', { name: 'Try again', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
      await expect(page).toHaveTitle('Aircastle - Sign in')
      await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
    })
  })
}

test.describe('mobile failure recovery', () => {
  test.use({
    expectedRuntimeErrors: [faultMarker('runtime')],
    colorScheme: 'light',
    viewport: { width: 390, height: 844 },
  })

  test('recovery keeps the saved dark theme and Home leaves the failed app', async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, 'dark'), themeStorageKey)
    await page.goto('/sign-in')
    await failAfterStartup(page, 'runtime')
    await expect(
      page.getByRole('heading', { name: 'Something went wrong', exact: true }),
    ).toBeVisible()
    await expect(page.locator('html')).toHaveClass(/\bdark\b/)
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
      'href',
      '/brand/favicon-dark.svg',
    )
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    await page.getByRole('link', { name: 'Back to home', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Aircastle', exact: true })).toBeVisible()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
  })
})

test('handled rejections and resource error events do not replace a healthy page', async ({
  page,
}) => {
  await page.goto('/sign-in')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await page.evaluate(async () => {
    await Promise.reject(new Error('handled verification failure')).catch(() => undefined)
    window.dispatchEvent(new Event('error'))
  })
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toHaveCount(0)
})
