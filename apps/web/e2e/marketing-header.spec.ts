import { test, expect } from './support'

for (const theme of ['light', 'dark'] as const) {
  for (const width of [1440, 390]) {
    test(`landing header ${theme} at ${width}px gains a solid borderless surface only after scrolling`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 600 })
      await page.addInitScript((value) => localStorage.setItem('aircastle-theme', value), theme)
      await page.goto('/')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const header = page.getByRole('banner')
      await expect(header).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
      await expect(header).toHaveCSS('backdrop-filter', 'none')
      const originalHeight = (await header.boundingBox())!.height
      await page.evaluate(() => window.scrollTo(0, 48))
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
      const pageBackground = await page.evaluate(() =>
        getComputedStyle(document.querySelector('main')!).backgroundColor === 'rgba(0, 0, 0, 0)'
          ? getComputedStyle(document.body).backgroundColor
          : getComputedStyle(document.querySelector('main')!).backgroundColor,
      )
      await expect(header).toHaveCSS('background-color', pageBackground)
      await expect(header).toHaveCSS('backdrop-filter', 'none')
      await expect(header).toHaveCSS('border-bottom-width', '0px')
      const scrolled = await header.boundingBox()
      expect(scrolled?.y).toBe(0)
      expect(scrolled?.height).toBe(originalHeight)
      await page.evaluate(() => window.scrollTo(0, 0))
      await expect(header).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
      await expect(header).toHaveCSS('backdrop-filter', 'none')
    })
  }
}

for (const width of [1440, 390]) {
  test(`landing header at ${width}px switches between dark and light in one click and remembers the choice`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 700 })
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const html = page.locator('html')
    await expect(html, 'first visit is dark').toHaveClass(/\bdark\b/)
    const open = page.getByRole('banner').getByRole('link', { name: 'Open Aircastle' })
    const lineHeight = await open.evaluate((element) =>
      parseFloat(getComputedStyle(element).lineHeight),
    )
    expect((await open.boundingBox())?.height, 'Open Aircastle stays on one line').toBeLessThan(
      lineHeight * 1.5 + 16,
    )

    const toggle = page.getByRole('banner').getByRole('button', { name: 'Dark theme' })
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await toggle.click()
    await expect(page.getByRole('menu'), 'one click, no menu').toHaveCount(0)
    await expect(html).not.toHaveClass(/\bdark\b/)
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(await page.evaluate(() => localStorage.getItem('aircastle-theme'))).toBe('light')

    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(html).not.toHaveClass(/\bdark\b/)

    await toggle.click()
    await expect(html).toHaveClass(/\bdark\b/)
  })
}
