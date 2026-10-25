import { test, expect } from './support'

for (const theme of ['light', 'dark'] as const) {
  for (const width of [1440, 390]) {
    test(`navbar-only landing ${theme} at ${width}px keeps navigation without hero content`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.addInitScript((value) => localStorage.setItem('aircastle-theme', value), theme)
      await page.goto('/')
      const header = page.getByRole('banner')
      await expect(header.getByRole('link', { name: 'Aircastle home' })).toBeVisible()
      await expect(page.getByRole('heading')).toHaveCount(0)
      await expect(page.locator('main')).toBeEmpty()
      await expect(page.locator('video, canvas')).toHaveCount(0)
      await expect(header).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
      await expect(header).toHaveCSS('border-bottom-color', 'rgba(0, 0, 0, 0)')
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      )
      if (width < 768) {
        const trigger = page.getByRole('button', { name: 'Open navigation' })
        await trigger.click()
        const menu = page.getByRole('dialog', { name: 'Navigation' })
        await expect(menu).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(trigger).toBeFocused()
        await trigger.click()
        await menu.getByRole('link', { name: 'Sign in', exact: true }).click()
      } else {
        await header.getByRole('link', { name: 'Sign in', exact: true }).click()
      }
      await expect(page.getByRole('heading', { name: 'Sign in to Aircastle' })).toBeVisible()
      await page.getByRole('link', { name: 'Home', exact: true }).click()
      if (width < 768) await page.getByRole('button', { name: 'Open navigation' }).click()
      await page.getByRole('link', { name: 'Get started', exact: true }).click()
      await expect(page).toHaveURL(/\/sign-in$/)
    })
  }
}
