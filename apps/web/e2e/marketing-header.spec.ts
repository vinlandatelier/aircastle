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
