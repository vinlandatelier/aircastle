import { Buffer } from 'node:buffer'
import { test, expect } from './support'
import { themeStorageKey } from '../src/theme'

test('favicons embed small light and dark brand icons', async ({ request }) => {
  const icons: Buffer[] = []
  for (const theme of ['light', 'dark']) {
    const favicon = await request.get(`/brand/favicon-${theme}.svg`)
    expect(favicon.ok()).toBe(true)
    const svg = await favicon.text()
    expect(svg.length, `${theme} favicon stays small`).toBeLessThan(16_000)
    const embedded = svg.match(/data:image\/png;base64,([^"\s]+)/)?.[1]
    expect(embedded).toBeTruthy()
    const png = Buffer.from(embedded!, 'base64')
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([64, 64])
    icons.push(png)
  }
  expect(icons[0]!.equals(icons[1]!)).toBe(false)
})

for (const theme of ['light', 'dark'] as const) {
  test(`sign-in favicon follows saved ${theme} preference over system theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme === 'light' ? 'dark' : 'light' })
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
      key: themeStorageKey,
      value: theme,
    })
    await page.goto('/sign-in')
    await expect(page.getByRole('heading', { name: 'Sign in to Aircastle' })).toBeVisible()
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
      'href',
      `/brand/favicon-${theme}.svg`,
    )
  })
}

test('a first visit is dark whatever the system prefers', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/sign-in')
  await expect(page.locator('html')).toHaveClass(/\bdark\b/)
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/brand/favicon-dark.svg')
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveClass(/\bdark\b/)
})

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`sign-in art is a five-armed Gale vortex that ${reducedMotion === 'reduce' ? 'holds still' : 'turns counter-clockwise, faster near the centre'}`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion })
    await page.goto('/sign-in')
    await expect(page.getByRole('heading', { name: 'Sign in to Aircastle' })).toBeVisible()
    const vortex = page.locator('[data-sign-in-vortex]')
    await expect(vortex).toBeVisible()
    await expect(vortex).toHaveAttribute('aria-hidden', 'true')
    const rings = vortex.locator('[data-vortex-ring]')
    expect(await rings.count()).toBeGreaterThanOrEqual(8)
    for (const ring of await rings.all())
      await expect(ring.locator('[data-vortex-arm]')).toHaveCount(5)

    const turns = await rings.evaluateAll((elements) =>
      elements.map((element) => {
        const [spin] = element.getAnimations()
        if (!spin) return null
        spin.pause()
        spin.currentTime = 2000
        const { a, b } = new DOMMatrix(getComputedStyle(element).transform)
        return (Math.atan2(b, a) * 180) / Math.PI
      }),
    )
    if (reducedMotion === 'reduce') {
      expect(turns.every((turn) => turn === null)).toBe(true)
      return
    }
    expect(
      turns.every((turn) => turn !== null && turn < 0),
      'every ring turns counter-clockwise',
    ).toBe(true)
    const inner = Math.abs(turns[0] ?? 0)
    const outer = Math.abs(turns.at(-1) ?? 0)
    expect(inner, 'the centre turns faster than the edge').toBeGreaterThan(outer)
  })
}
