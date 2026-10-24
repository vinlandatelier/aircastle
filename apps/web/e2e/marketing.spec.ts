import { test, expect } from './support'

for (const theme of ['light', 'dark'] as const) {
  for (const width of [1440, 390]) {
    test(`Aircastle landing ${theme} at ${width}px keeps its brand, navigation and calls to action`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.addInitScript((value) => localStorage.setItem('aircastle-theme', value), theme)
      await page.goto('/')
      await expect(
        page.getByRole('heading', { level: 1, name: 'Your content. Defined in code.' }),
      ).toBeVisible()
      const logo = page.getByRole('banner').getByRole('link', { name: 'Aircastle home' })
      await expect(logo).toBeVisible()
      await expect(logo.locator('.brand-logo')).toHaveCSS(
        'background-image',
        /logo-(light|dark)\.png/,
      )
      await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`))
      await expect(page.locator('main')).toHaveAttribute('data-theme-scope', 'marketing')
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      )
      await expect(page.getByRole('heading', { name: 'Built on an open stack' })).toBeVisible()
      if (theme === 'light' && width === 1440) {
        await page.getByRole('button', { name: 'Pause animation' }).click()
        await expect(page.getByText('PostgreSQL', { exact: true })).toBeVisible()
        await page.getByRole('button', { name: 'Play animation' }).click()
        await expect(page.getByRole('button', { name: 'Pause animation' })).toBeVisible()
      }
      if (width < 768) {
        const trigger = page.getByRole('button', { name: 'Open navigation' })
        await trigger.click()
        const menu = page.getByRole('dialog', { name: 'Navigation' })
        await expect(menu).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(menu).not.toBeVisible()
        await expect(trigger).toBeFocused()
        await trigger.click()
        await menu.getByRole('link', { name: 'Sign in', exact: true }).click()
      } else {
        await page
          .getByRole('navigation', { name: 'Marketing navigation' })
          .getByRole('link', { name: 'Sign in', exact: true })
          .click()
      }
      await expect(page.getByRole('heading', { name: 'Sign in to Aircastle' })).toBeVisible()
      await page.getByRole('link', { name: 'Home', exact: true }).click()
      await page.getByRole('link', { name: 'Get started', exact: true }).first().click()
      await expect(page).toHaveURL(/\/sign-in$/)
      await page.goBack()
      await page.getByRole('link', { name: 'Explore dashboard', exact: true }).click()
      await expect(page).toHaveTitle('Aircastle - Collections')
    })
  }
}

test('reduced-motion landing remains readable on a narrow screen with enlarged text', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 320, height: 800 })
  await page.goto('/')
  await page.evaluate(() => (document.documentElement.style.fontSize = '32px'))
  await expect(
    page.getByRole('heading', { level: 1, name: 'Your content. Defined in code.' }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Explore dashboard' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await expect(page.getByRole('button', { name: 'Pause animation' })).toHaveCount(0)
})
