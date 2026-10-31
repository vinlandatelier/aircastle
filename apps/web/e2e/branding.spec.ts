import { Buffer } from 'node:buffer'
import { test, expect } from './support'
import { themeStorageKey } from '../src/theme'
import { origins } from './origins'

test.use({ baseURL: origins.fixture.url })

test.beforeEach(async ({ baseURL }, info) => {
  expect(baseURL).toBe(origins.fixture.url)
  info.annotations.push({
    type: 'scenario',
    description: 'display-only auth transport for public routing, metadata, and recovery',
  })
})

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
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
      'href',
      `/brand/favicon-${theme}.svg`,
    )
  })
}

test('sign-in favicon follows live system theme changes', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/sign-in')
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/brand/favicon-light.svg')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/brand/favicon-dark.svg')
})
