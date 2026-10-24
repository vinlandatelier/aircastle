import { test, expect } from './support'

for (const theme of ['light', 'dark'] as const) {
  for (const width of [1440, 390]) {
    test(`monochrome hero ${theme} at ${width}px stays readable with a still background`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.addInitScript((value) => localStorage.setItem('aircastle-theme', value), theme)
      await page.goto('/')
      const hero = page.getByRole('region', { name: 'Your content. Defined in code.' })
      await expect(hero).toBeVisible()
      const bounds = (await hero.boundingBox())!
      expect(bounds.x).toBe(0)
      expect(bounds.width).toBe(width)
      expect(bounds.height).toBeGreaterThanOrEqual(800)
      await expect(hero.getByRole('heading', { level: 1 })).toHaveCSS('color', 'oklch(0.985 0 0)')
      await expect(hero.getByRole('link', { name: 'Get started' })).toHaveAttribute(
        'href',
        '/sign-in',
      )
      await expect(hero.getByRole('link', { name: 'Explore dashboard' })).toHaveAttribute(
        'href',
        '/dash',
      )
      await expect(hero.getByRole('button', { name: 'Pause background animation' })).toHaveCount(0)
      await expect(hero.locator('video')).toHaveAttribute('poster', '/brand/hero/mesh.png')
      expect(await hero.locator('video').evaluate((video: HTMLVideoElement) => video.paused)).toBe(
        true,
      )
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      )
      const logo = page.getByRole('banner').locator('.brand-logo')
      await expect(logo).toHaveCSS('background-image', /logo-dark\.png/)
    })
  }
}

test('hero animation plays, pauses and resumes without changing page content', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  const hero = page.getByRole('region', { name: 'Your content. Defined in code.' })
  const video = hero.locator('video')
  await expect
    .poll(() => video.evaluate((node: HTMLVideoElement) => node.currentTime))
    .toBeGreaterThan(0)
  await hero.getByRole('button', { name: 'Pause background animation' }).click()
  expect(await video.evaluate((node: HTMLVideoElement) => node.paused)).toBe(true)
  const pausedTime = await video.evaluate((node: HTMLVideoElement) => node.currentTime)
  await page.waitForTimeout(200)
  expect(await video.evaluate((node: HTMLVideoElement) => node.currentTime)).toBe(pausedTime)
  await hero.getByRole('button', { name: 'Play background animation' }).click()
  await expect
    .poll(() => video.evaluate((node: HTMLVideoElement) => node.currentTime))
    .toBeGreaterThan(pausedTime)
  await expect(hero.getByRole('heading', { level: 1 })).toBeVisible()
})
