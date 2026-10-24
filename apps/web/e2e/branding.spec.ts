import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { test, expect } from './support'

test('shell:R5 favicons use the current light and dark brand artwork', async ({ request }) => {
  for (const theme of ['light', 'dark']) {
    const logo = await request.get(`/brand/logo-${theme}.png`)
    const favicon = await request.get(`/brand/favicon-${theme}.svg`)
    expect(logo.ok()).toBe(true)
    expect(favicon.ok()).toBe(true)
    const embedded = (await favicon.text()).match(/data:image\/png;base64,([^"\s]+)/)?.[1]
    expect(embedded).toBeTruthy()
    const actual = createHash('sha256').update(Buffer.from(embedded!, 'base64')).digest('hex')
    const expected = createHash('sha256')
      .update(await logo.body())
      .digest('hex')
    expect(actual, `${theme} favicon matches the current brand artwork`).toBe(expected)
  }
})

for (const theme of ['light', 'dark'] as const) {
  test(`shell:R5 sign-in favicon follows saved ${theme} preference over system theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme === 'light' ? 'dark' : 'light' })
    await page.addInitScript((value) => localStorage.setItem('aircastle-theme', value), theme)
    await page.goto('/sign-in')
    await expect(page.getByRole('heading', { name: 'Sign in to Aircastle' })).toBeVisible()
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
      'href',
      `/brand/favicon-${theme}.svg`,
    )
  })
}

test('shell:R5 sign-in favicon follows live system theme changes', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/sign-in')
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/brand/favicon-light.svg')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/brand/favicon-dark.svg')
})
