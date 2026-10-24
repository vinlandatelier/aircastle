import { test, expect, visit } from './support'

test.use({ viewport: { width: 1440, height: 900 } })

test('shell:R2 normal built entry loads assets and redirects to Collections', async ({ page }) => {
  const assets: { type: string; status: number; url: string }[] = []
  page.on('response', (response) => {
    const type = response.request().resourceType()
    if (type === 'script' || type === 'stylesheet') {
      assets.push({ type, status: response.status(), url: response.url() })
    }
  })
  await visit(page)
  await expect(page).toHaveURL(/\/dash\/workspaces\/demo\/projects\/demo\/collections$/)
  await expect(page).toHaveTitle('Aircastle')
  await expect(page.getByRole('banner').getByRole('link', { name: 'Aircastle' })).toBeVisible()
  await expect(page.getByRole('main')).toBeVisible()
  const navigation = page.getByRole('navigation', { name: 'Main navigation' })
  await expect(navigation.locator('a[aria-current="page"]')).toHaveCount(1)
  await expect(navigation.getByRole('link', { name: 'Collections', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )
  const origin = new URL(page.url()).origin
  for (const type of ['script', 'stylesheet']) {
    const loaded = assets.filter(
      (asset) => asset.type === type && new URL(asset.url).origin === origin,
    )
    expect(loaded.length, `built ${type} was loaded`).toBeGreaterThan(0)
    for (const asset of loaded) {
      expect(new URL(asset.url).pathname).toMatch(/^\/assets\//)
      expect(asset.status, asset.url).toBeGreaterThanOrEqual(200)
      expect(asset.status, asset.url).toBeLessThan(400)
    }
  }
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    'href',
    /\/brand\/favicon-(light|dark)\.svg$/,
  )
  const icon = await page.locator('link[rel="icon"]').getAttribute('href')
  expect(icon).toBeTruthy()
  const response = await page.evaluate(async (href) => {
    const result = await fetch(href)
    return { ok: result.ok, type: result.headers.get('content-type'), body: await result.text() }
  }, icon!)
  expect(response.ok, 'browser loads the current theme favicon').toBe(true)
  expect(response.type).toContain('image/svg+xml')
  expect(response.body).toContain('<svg')
})

test('shell:R2 direct Settings entry survives reload in the same context', async ({ page }) => {
  await visit(page, 'normal', '/dash/workspaces/team-42/projects/site_beta/settings')
  for (const reload of [false, true]) {
    if (reload) await page.reload()
    await expect(page).toHaveURL(/\/dash\/workspaces\/team-42\/projects\/site_beta\/settings$/)
    await expect(page.getByRole('main')).toBeVisible()
    const navigation = page.getByRole('navigation', { name: 'Main navigation' })
    await expect(navigation.getByRole('link', { name: 'Settings', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(navigation.locator('a[aria-current="page"]')).toHaveCount(1)
  }
})
