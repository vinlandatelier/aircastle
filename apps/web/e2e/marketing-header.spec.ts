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

for (const width of [320, 360]) {
  test(`landing header fits a ${width}px phone without scrolling sideways`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 })
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    )
    const open = page.getByRole('banner').getByRole('link', { name: 'Open Aircastle' })
    const box = await open.boundingBox()
    expect((box?.x ?? Infinity) + (box?.width ?? 0)).toBeLessThanOrEqual(width)
  })
}

for (const theme of ['light', 'dark'] as const) {
  test(`the ${theme} theme toggle works from the keyboard with a clearly visible focus outline`, async ({
    page,
  }) => {
    await page.addInitScript((value) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem('aircastle-theme', value)
        sessionStorage.setItem('seeded', '1')
      }
    }, theme)
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const toggle = page.getByRole('banner').getByRole('button', { name: 'Dark theme' })
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await expect(
      page.getByRole('banner').getByRole('link', { name: 'Documentation' }),
    ).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(toggle).toBeFocused()
    const contrast = await toggle.evaluate((element) => {
      const style = getComputedStyle(element)
      const context = document.createElement('canvas').getContext('2d')
      if (!context) throw new Error('No canvas')
      const rgb = (colour: string) => {
        context.clearRect(0, 0, 1, 1)
        context.fillStyle = colour
        context.fillRect(0, 0, 1, 1)
        const [red = 0, green = 0, blue = 0] = context.getImageData(0, 0, 1, 1).data
        return [red, green, blue].map((channel) => {
          const value = channel / 255
          return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
        })
      }
      const luminance = ([red = 0, green = 0, blue = 0]: number[]) =>
        0.2126 * red + 0.7152 * green + 0.0722 * blue
      const outline = luminance(rgb(style.outlineColor))
      const page = luminance(rgb(getComputedStyle(document.body).backgroundColor))
      return {
        width: parseFloat(style.outlineWidth),
        styleName: style.outlineStyle,
        ratio: (Math.max(outline, page) + 0.05) / (Math.min(outline, page) + 0.05),
      }
    })
    expect(contrast.styleName).toBe('solid')
    expect(contrast.width).toBeGreaterThanOrEqual(2)
    expect(contrast.ratio, 'the focus outline stands out from the page').toBeGreaterThanOrEqual(3)
    const html = page.locator('html')
    await page.keyboard.press('Enter')
    await expect(html).toHaveClass(new RegExp(`\\b${theme === 'dark' ? 'light' : 'dark'}\\b`))
    await expect(toggle).toBeFocused()
    await page.keyboard.press('Space')
    await expect(html).toHaveClass(new RegExp(`\\b${theme}\\b`))
    await expect(toggle).toHaveAttribute('aria-pressed', String(theme === 'dark'))
  })
}

for (const width of [1440, 320]) {
  test(`landing header at ${width}px has a docs icon beside the theme switch that leads to /docs`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 700 })
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const banner = page.getByRole('banner')
    const docs = banner.getByRole('link', { name: 'Documentation' })
    await expect(docs).toHaveAttribute('href', '/docs')
    const docsBox = await docs.boundingBox()
    const themeBox = await banner.getByRole('button', { name: 'Dark theme' }).boundingBox()
    if (!docsBox || !themeBox) throw new Error('The header icons are not laid out')
    expect(Math.abs(docsBox.y - themeBox.y), 'it sits on the theme switch line').toBeLessThan(2)
    expect(Math.abs(docsBox.width - themeBox.width), 'at the same size').toBeLessThan(1)
    expect(themeBox.x - (docsBox.x + docsBox.width), 'right beside it').toBeLessThan(12)
    expect(themeBox.x - (docsBox.x + docsBox.width)).toBeGreaterThanOrEqual(0)
    await docs.hover()
    await expect(page.getByText('Docs', { exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    )
  })
}
