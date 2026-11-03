import { test, expect } from './support'

for (const theme of ['light', 'dark'] as const) {
  for (const width of [1440, 390]) {
    test(`landing ${theme} at ${width}px opens Aircastle from the header`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.addInitScript((value) => localStorage.setItem('aircastle-theme', value), theme)
      await page.goto('/')
      const header = page.getByRole('banner')
      const home = header.getByRole('link', { name: 'Aircastle home' })
      await expect(home).toBeVisible()
      await expect(home).toHaveText('Aircastle')
      await expect(home).toHaveCSS('font-size', '22px')
      await expect(home).toHaveCSS('font-weight', '400')
      await expect(page.locator('video, canvas')).toHaveCount(0)
      await expect(header).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
      await expect(header).toHaveCSS('border-bottom-color', 'rgba(0, 0, 0, 0)')
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      )
      const open = header.getByRole('link', { name: 'Open Aircastle', exact: true })
      await expect(open).toBeVisible()
      await expect(open).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
      await expect(open).toHaveCSS('font-size', '18px')
      await expect(open).toHaveCSS('font-weight', '300')
      await expect(page.getByRole('button', { name: 'Open navigation' })).toHaveCount(0)
      await open.click()
      await expect(page).toHaveURL(/\/sign-in$/)
    })
  }
}

test('hovering the home link spins the logo', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  const home = page.getByRole('banner').getByRole('link', { name: 'Aircastle home' })
  const logo = home.locator('.brand-logo')
  await expect(logo).toHaveCSS('animation-name', 'none')
  await home.hover()
  await expect(logo).toHaveCSS('animation-name', 'brand-spin')
})

const centreLinks = [
  ['Pricing', '/pricing'],
  ['Blog', '/blog'],
  ['Roadmap', '/roadmap'],
  ['Docs', '/docs'],
] as const

test('desktop header centres Product and the page links', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Marketing navigation', exact: true })
  const product = nav.getByRole('button', { name: 'Product', exact: true })
  await expect(product).toBeVisible()
  for (const [name, href] of centreLinks)
    await expect(nav.getByRole('link', { name, exact: true })).toHaveAttribute('href', href)
  const productBox = await product.boundingBox()
  const docsBox = await nav.getByRole('link', { name: 'Docs', exact: true }).boundingBox()
  if (!productBox || !docsBox) throw new Error('Centre navigation is not laid out')
  const centre = (productBox.x + docsBox.x + docsBox.width) / 2
  expect(Math.abs(centre - 720)).toBeLessThan(2)
})

test('hovering Product opens its menu and flips the chevron up', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  const product = page.getByRole('button', { name: 'Product', exact: true })
  const chevron = product.locator('svg')
  await expect(product).toHaveAttribute('aria-expanded', 'false')
  await expect(chevron).toHaveCSS('rotate', 'none')
  await product.hover()
  await expect(product).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(chevron).toHaveCSS('rotate', '180deg')
  await page.mouse.move(720, 800)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(product).toHaveAttribute('aria-expanded', 'false')
})

test('mobile header hides the centre links', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Marketing navigation', exact: true })
  await expect(nav.getByRole('button', { name: 'Product', exact: true })).toBeHidden()
  for (const [name] of centreLinks)
    await expect(nav.getByRole('link', { name, exact: true })).toBeHidden()
})
