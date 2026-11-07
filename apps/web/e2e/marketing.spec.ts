import { test, expect } from './support'

for (const theme of ['light', 'dark'] as const) {
  for (const width of [1440, 390]) {
    test(`landing ${theme} at ${width}px shows the hero and opens Aircastle`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.addInitScript((value) => localStorage.setItem('aircastle-theme', value), theme)
      await page.goto('/')
      const header = page.getByRole('banner')
      const home = header.getByRole('link', { name: 'Aircastle home' })
      await expect(home).toBeVisible()
      await expect(home).toHaveText('Aircastle')
      await expect(home).toHaveCSS('font-size', '22px')
      await expect(home).toHaveCSS('font-weight', '400')
      const hero = page.getByRole('heading', {
        level: 1,
        name: /^Autopilot for everything you write\. /,
      })
      await expect(hero).toBeVisible()
      await expect(hero).toHaveCSS('font-size', width >= 768 ? '48px' : '36px')
      await expect(hero).toHaveCSS('font-weight', '250')
      const headline = hero.locator(':scope > span').first()
      const tagline = hero.getByText(
        'Agents for your content operations, so you can focus on thought.',
        { exact: true },
      )
      await expect(tagline).toBeVisible()
      const color = (locator: typeof tagline) =>
        locator.evaluate((element) => getComputedStyle(element).color)
      expect(await color(tagline)).not.toBe(await color(headline))
      if (width >= 1440) {
        const lineWidths = await tagline.evaluate((element) => {
          const range = document.createRange()
          range.selectNodeContents(element)
          const lines = new Map<number, number>()
          for (const rect of range.getClientRects()) {
            const top = Math.round(rect.top)
            lines.set(top, (lines.get(top) ?? 0) + rect.width)
          }
          return [...lines.entries()].sort(([a], [b]) => a - b).map(([, lineWidth]) => lineWidth)
        })
        expect(lineWidths).toHaveLength(2)
        expect(Math.min(...lineWidths) / Math.max(...lineWidths)).toBeGreaterThan(0.6)
      }
      await expect(page.locator('video, canvas')).toHaveCount(0)
      await expect(header).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
      await expect(header).toHaveCSS('border-bottom-width', '0px')
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      )
      const open = header.getByRole('link', { name: 'Open Aircastle', exact: true })
      await expect(open).toBeVisible()
      await expect(open).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
      await expect(open).toHaveCSS('font-size', '18px')
      await expect(open).toHaveCSS('font-weight', '300')
      await expect(page.getByRole('button', { name: 'Open navigation' })).toHaveCount(0)
      await expect(open).toHaveAttribute('href', '/dash')
    })
  }
}

const rotatingWords = ['write', 'research', 'publish', 'audit'] as const
const shownWord = (page: import('@playwright/test').Page) =>
  page.getByRole('heading', { level: 1 }).locator('[aria-hidden="true"] > span > span')

test('hero cycles its last word while its accessible name stays on write', async ({ page }) => {
  await page.clock.install()
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  const hero = page.getByRole('heading', {
    level: 1,
    name: /^Autopilot for everything you write\. /,
  })
  for (const word of [...rotatingWords, rotatingWords[0]]) {
    await expect(shownWord(page)).toHaveText(word)
    await expect(hero).toBeVisible()
    await page.clock.runFor(4000)
  }
})

test('hero keeps write with reduced motion', async ({ page }) => {
  await page.clock.install()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(shownWord(page)).toHaveText('write')
  await page.clock.runFor(10000)
  await expect(shownWord(page)).toHaveText('write')
})

test('hovering the home link spins the logo counter-clockwise', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  const home = page.getByRole('banner').getByRole('link', { name: 'Aircastle home' })
  const logo = home.locator('.brand-logo')
  await expect(logo).toHaveCSS('animation-name', 'none')
  await home.hover()
  await expect(logo).toHaveCSS('animation-name', 'brand-spin')
  const angle = await logo.evaluate((element) => {
    const [spin] = element.getAnimations()
    if (!spin) throw new Error('Logo is not spinning')
    spin.pause()
    spin.currentTime = 1000
    const { a, b } = new DOMMatrix(getComputedStyle(element).transform)
    return (Math.atan2(b, a) * 180) / Math.PI
  })
  expect(angle, 'the logo turns counter-clockwise').toBeLessThan(0)
})

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`rotating word underline ${reducedMotion === 'reduce' ? 'stays still' : 'sweeps a beam'} with ${reducedMotion} motion`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion })
    await page.goto('/')
    const slot = page.getByRole('heading', { level: 1 }).locator('[aria-hidden="true"] > span')
    const underline = await slot.evaluate((element) => {
      const line = getComputedStyle(element, '::after')
      const word = element.firstElementChild
      const beam = word ? getComputedStyle(word, '::before') : undefined
      return {
        line: line.backgroundImage,
        height: line.height,
        beam: beam?.animationName,
        beamGradient: beam?.backgroundImage,
        beamRuns: beam?.animationIterationCount,
      }
    })
    expect(underline.line).toBe('none')
    expect(parseFloat(underline.height)).toBeGreaterThan(0)
    if (reducedMotion === 'reduce') expect(underline.beam).toBe('none')
    else {
      expect(underline.beam).toContain('underline-beam')
      expect(underline.beamRuns).toBe('1')
      expect(underline.beamGradient).toContain('linear-gradient')
    }
  })
}

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

for (const theme of ['light', 'dark'] as const) {
  test(`${theme} hero credits Vinland above the title`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('aircastle-theme', value), theme)
    await page.goto('/')
    const credit = page.getByText('Presented by Vinland', { exact: true })
    await expect(credit).toBeVisible()
    const title = page.getByRole('heading', { level: 1 })
    const creditBox = await credit.boundingBox()
    const titleBox = await title.boundingBox()
    if (!creditBox || !titleBox) throw new Error('Hero is not laid out')
    expect(creditBox.y + creditBox.height).toBeLessThanOrEqual(titleBox.y)
    await expect(credit.locator('.vinland-logo')).toHaveCSS(
      'background-image',
      new RegExp(`/brand/vinland-${theme}\\.png`),
    )
  })
}

test('Vinland credit opens vinland.com.au in a new tab', async ({ page }) => {
  await page.goto('/')
  const vinland = page.getByRole('link', { name: 'Vinland', exact: true })
  await expect(vinland).toHaveAttribute('href', 'https://vinland.com.au')
  await expect(vinland).toHaveAttribute('target', '_blank')
  await expect(vinland).toHaveAttribute('rel', /noopener/)
})

test('hero explains Aircastle below the title in regular text', async ({ page }) => {
  await page.goto('/')
  const summary = page.getByText(
    'Aircastle is the headless CMS that gets you from idea to published faster. Our agents take on the busywork, so you can publish more than ever before.',
    { exact: true },
  )
  await expect(summary).toBeVisible()
  await expect(summary).toHaveCSS('font-weight', '300')
  const titleBox = await page.getByRole('heading', { level: 1 }).boundingBox()
  const summaryBox = await summary.boundingBox()
  if (!titleBox || !summaryBox) throw new Error('Hero is not laid out')
  expect(summaryBox.y).toBeGreaterThanOrEqual(titleBox.y + titleBox.height)
})

test('hero call to action sits below the summary and opens sign-in', async ({ page }) => {
  await page.goto('/')
  const cta = page.getByRole('main').getByRole('link', { name: 'Get started', exact: true })
  await expect(cta).toBeVisible()
  await expect(cta).toHaveCSS('font-weight', '400')
  await expect(cta.locator('svg')).toHaveCount(0)
  const summaryBox = await page.getByText(/^Aircastle is the headless CMS/).boundingBox()
  const ctaBox = await cta.boundingBox()
  if (!summaryBox || !ctaBox) throw new Error('Hero is not laid out')
  expect(ctaBox.y).toBeGreaterThanOrEqual(summaryBox.y + summaryBox.height)
  await cta.click()
  await expect(page).toHaveURL(/\/sign-in$/)
})

test('hero offers a dim ghost demo link beside the call to action', async ({ page }) => {
  await page.goto('/')
  const main = page.getByRole('main')
  const cta = main.getByRole('link', { name: 'Get started', exact: true })
  const demo = main.getByRole('link', { name: 'See Aircastle in action', exact: true })
  await expect(demo).toBeVisible()
  await expect(demo).toHaveAttribute('href', '/demo')
  await expect(demo).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  const color = (locator: typeof demo) =>
    locator.evaluate((element) => getComputedStyle(element).color)
  const summaryColor = await page
    .getByText(/^Aircastle is the headless CMS/)
    .evaluate((element) => getComputedStyle(element).color)
  expect(await color(demo)).toBe(summaryColor)
  const ctaBox = await cta.boundingBox()
  const demoBox = await demo.boundingBox()
  if (!ctaBox || !demoBox) throw new Error('Hero actions are not laid out')
  expect(demoBox.x).toBeGreaterThanOrEqual(ctaBox.x + ctaBox.width)
  expect(Math.abs(demoBox.y + demoBox.height / 2 - (ctaBox.y + ctaBox.height / 2))).toBeLessThan(2)
  const arrow = demo.locator('svg')
  await expect(arrow).toHaveCSS('translate', 'none')
  await demo.hover()
  await expect(arrow).not.toHaveCSS('translate', 'none')
})

test('underline beam keeps one length across every rotating word', async ({ page }) => {
  await page.clock.install()
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  const beamLength = () =>
    shownWord(page).evaluate((element) => getComputedStyle(element, '::before').backgroundSize)
  await expect(shownWord(page)).toHaveText('write')
  const writeBeam = await beamLength()
  await page.clock.runFor(4000)
  await expect(shownWord(page)).toHaveText('research')
  expect(await beamLength()).toBe(writeBeam)
  expect(writeBeam.split(' ')[0]).toMatch(/px$/)
})
