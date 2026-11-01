import { fixtureTest as test, expect } from './support'
import { themeStorageKey } from '../src/theme'

for (const theme of ['light', 'dark'] as const) {
  test(`unknown pages use the branded ${theme} recovery page on desktop and mobile`, async ({
    page,
  }) => {
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
      key: themeStorageKey,
      value: theme,
    })
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport)
      for (const path of [
        '/a-page-that-does-not-exist',
        '/dash/workspaces/acme/projects/editorial/missing',
        '/privacy-policy',
      ]) {
        await page.goto(path)
        await expect(page).toHaveURL(new RegExp(`${path}$`))
        await expect(
          page.getByRole('heading', { name: 'Page not found', exact: true }),
        ).toBeVisible()
        await expect(page).toHaveTitle('Aircastle - Page not found')
        await expect(page.locator('head title')).toHaveCount(1)
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
        await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(0)
        await expect(page.getByRole('link', { name: 'Back to home', exact: true })).toHaveAttribute(
          'href',
          '/',
        )
        await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute(
          'href',
          '/sign-in',
        )
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          viewport.width,
        )
      }
    }
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Page not found', exact: true })).toBeVisible()
    await page.getByRole('link', { name: 'Back to home', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Aircastle', exact: true })).toBeVisible()
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
    await page.goBack()
    await expect(page).toHaveTitle('Aircastle - Page not found')
    await page.getByRole('link', { name: 'Sign in', exact: true }).click()
    await expect(page).toHaveTitle('Aircastle - Sign in')
    await page.getByRole('link', { name: 'Home', exact: true }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { name: 'Aircastle', exact: true })).toBeVisible()
  })
}
