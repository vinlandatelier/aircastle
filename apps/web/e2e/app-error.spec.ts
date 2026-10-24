import process from 'node:process'
import { test, expect } from './support'

for (const fault of ['render', 'loader', 'runtime', 'rejection'] as const) {
  test.describe(`${fault} failure recovery`, () => {
    const marker = `Aircastle verification ${fault} failure: private details`
    test.use({ expectedRuntimeErrors: [marker] })

    test('unexpected failures show safe recovery and retry the original page', async ({ page }) => {
      const origin =
        fault === 'render' || fault === 'loader'
          ? process.env.WEB_FIXTURE_ORIGIN
          : process.env.WEB_ORIGIN
      await page.goto(`${origin}/sign-in?scenario=error-${fault}`)
      if (fault === 'runtime' || fault === 'rejection') {
        await expect(page.getByRole('heading', { name: 'Sign in to Aircastle' })).toBeVisible()
        await page.evaluate(
          ({ fault, marker }) => {
            setTimeout(() => {
              if (fault === 'runtime') throw new Error(marker)
              void Promise.reject(new Error(marker))
            }, 0)
          },
          { fault, marker },
        )
      }
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
      await expect(page.getByRole('heading', { name: 'Sign in to Aircastle' })).toBeVisible()
      await expect(page).toHaveTitle('Aircastle - Sign in')
      await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
    })
  })
}

test.describe('cold failure recovery', () => {
  test.use({
    expectedRuntimeErrors: ['Aircastle verification loader failure: private details'],
    colorScheme: 'light',
    viewport: { width: 390, height: 844 },
  })

  test('early loader failure preserves saved dark theme and Home bypasses broken routing', async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem('aircastle-theme', 'dark'))
    await page.goto(`${process.env.WEB_FIXTURE_ORIGIN}/sign-in?scenario=error-loader`)
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

test.describe('unavailable storage recovery', () => {
  test.use({
    expectedRuntimeErrors: ['Aircastle verification loader failure: private details'],
    colorScheme: 'dark',
  })

  test('early failure uses system theme when browser storage is unavailable', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new DOMException('Storage blocked', 'SecurityError')
        },
      })
    })
    await page.goto(`${process.env.WEB_FIXTURE_ORIGIN}/sign-in?scenario=error-loader`)
    await expect(
      page.getByRole('heading', { name: 'Something went wrong', exact: true }),
    ).toBeVisible()
    await expect(page.locator('html')).toHaveClass(/\bdark\b/)
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
      'href',
      '/brand/favicon-dark.svg',
    )
  })
})

test('handled rejections and resource error events do not replace a healthy page', async ({
  page,
}) => {
  await page.goto('/sign-in')
  await expect(page.getByRole('heading', { name: 'Sign in to Aircastle' })).toBeVisible()
  await page.evaluate(async () => {
    await Promise.reject(new Error('handled verification failure')).catch(() => undefined)
    window.dispatchEvent(new Event('error'))
  })
  await expect(page.getByRole('heading', { name: 'Sign in to Aircastle' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toHaveCount(0)
})
