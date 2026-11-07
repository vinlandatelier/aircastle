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
  await expect
    .poll(() => page.locator('html').getAttribute('class'), { timeout: 1000, intervals: [100] })
    .toMatch(/\bdark\b/)
  await page.waitForTimeout(300)
  await expect(page.locator('html')).toHaveClass(/\bdark\b/)
})

test('sign-in art is the same green folds in light and dark, on an inset rounded card that says Meet Air', async ({
  page,
}) => {
  const looks: { left: number[]; right: number[]; brightness: number }[] = []
  for (const theme of ['light', 'dark'] as const) {
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
      key: themeStorageKey,
      value: theme,
    })
    await page.goto('/sign-in')
    await expect(page.getByRole('heading', { name: 'Sign in to Aircastle' })).toBeVisible()
    await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`))
    const art = page.locator('[data-sign-in-art]')
    await expect(art).toBeVisible()
    await expect(art.locator('[data-sign-in-backdrop]')).toHaveAttribute('aria-hidden', 'true')
    await expect(art.locator('feTurbulence')).toHaveCount(1)
    await expect(art.getByText('Aircastle')).toHaveCount(0)
    await expect(art.locator('img, svg image, .brand-logo')).toHaveCount(0)
    const greeting = art.locator('[data-sign-in-greeting]')
    await expect(greeting).toHaveText(/^Meet\s*Air$/)
    await expect(greeting.locator('[data-sign-in-air]')).toBeVisible()
    const learn = art.getByRole('link', { name: 'Learn more' })
    await expect(learn).toBeVisible()
    await expect(learn).toHaveAttribute('href', '/blog/meet-air')
    const size = (locator: import('@playwright/test').Locator) =>
      locator.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))
    expect(await size(greeting), 'a big greeting').toBeGreaterThanOrEqual(72)
    expect(await size(learn), 'a readable link').toBeGreaterThanOrEqual(22)
    const [line, more] = await Promise.all([greeting.boundingBox(), learn.boundingBox()])
    if (!line || !more) throw new Error('Greeting is not laid out')
    expect(more.y, 'Learn more sits just below').toBeGreaterThanOrEqual(line.y + line.height - 1)
    expect(more.y - (line.y + line.height), 'with clear room between them').toBeGreaterThanOrEqual(
      14,
    )
    expect(more.y - (line.y + line.height)).toBeLessThan(32)
    expect(
      Math.abs(more.x + more.width - (line.x + line.width)),
      'and is right-aligned with the greeting',
    ).toBeLessThan(2)
    const radius = parseFloat(
      await art.evaluate((element) => getComputedStyle(element).borderTopLeftRadius),
    )
    expect(radius, 'a rounded card').toBeGreaterThanOrEqual(16)
    const card = await art.boundingBox()
    expect(card?.x ?? 0, 'inset from the window edge').toBeGreaterThanOrEqual(8)
    expect(card?.y ?? 0).toBeGreaterThanOrEqual(8)
    const shot = (await art.screenshot()).toString('base64')
    looks.push(
      await page.evaluate(async (data) => {
        const image = new Image()
        image.src = `data:image/png;base64,${data}`
        await image.decode()
        const canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height
        const context = canvas.getContext('2d')
        if (!context) throw new Error('No canvas')
        context.drawImage(image, 0, 0)
        const average = (left: number, top: number) => {
          const pixels = context.getImageData(
            Math.floor(left * image.width),
            Math.floor(top * image.height),
            Math.floor(image.width * 0.1),
            Math.floor(image.height * 0.1),
          ).data
          const sum = [0, 0, 0]
          for (let index = 0; index < pixels.length; index += 4)
            for (const channel of [0, 1, 2]) sum[channel]! += pixels[index + channel] ?? 0
          return sum.map((value) => value / (pixels.length / 4))
        }
        const all = context.getImageData(0, 0, image.width, image.height).data
        let light = 0
        for (let index = 0; index < all.length; index += 4)
          light +=
            0.2126 * (all[index] ?? 0) +
            0.7152 * (all[index + 1] ?? 0) +
            0.0722 * (all[index + 2] ?? 0)
        return {
          left: average(0.02, 0.2),
          right: average(0.88, 0.6),
          brightness: light / (all.length / 4),
        }
      }, shot),
    )
  }
  const [light, dark] = looks
  if (!light || !dark) throw new Error('Both themes were not captured')
  expect(light.brightness, 'dim enough for white text to read well').toBeLessThan(175)
  expect(light.brightness, 'but still a light, fresh green').toBeGreaterThan(150)
  const [red = 0, green = 0] = light.left
  expect(green - red, 'green and cyan, not orange').toBeGreaterThan(40)
  for (const side of ['left', 'right'] as const)
    for (const channel of [0, 1, 2])
      expect(
        Math.abs((light[side][channel] ?? 0) - (dark[side][channel] ?? 0)),
        'the art does not change with the theme',
      ).toBeLessThan(4)
})

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`Meet Air sits in the middle of the sign-in art and Air's eyes ${reducedMotion === 'reduce' ? 'hold still' : 'follow the pointer'}`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion })
    await page.goto('/sign-in')
    const art = page.locator('[data-sign-in-art]')
    const air = art.locator('[data-sign-in-air]')
    await expect(air).toBeVisible()
    const [artBox, airBox] = await Promise.all([art.boundingBox(), air.boundingBox()])
    if (!artBox || !airBox) throw new Error('Art is not laid out')
    const greeting = await art.locator('[data-sign-in-greeting]').boundingBox()
    if (!greeting) throw new Error('Greeting is not laid out')
    expect(Math.abs(greeting.x + greeting.width / 2 - (artBox.x + artBox.width / 2))).toBeLessThan(
      2,
    )
    expect(
      Math.abs(greeting.y + greeting.height / 2 - (artBox.y + artBox.height / 2)),
    ).toBeLessThan(40)
    expect(greeting.width / artBox.width, 'sized to the panel').toBeGreaterThan(0.35)
    expect(airBox.height, 'Air sits in the line of text').toBeLessThan(greeting.height * 1.2)
    const eye = air.locator('[data-air-eye]').first()
    await expect(air.locator('[data-air-eye]')).toHaveCount(2)
    const eyeX = async () => (await eye.boundingBox())?.x ?? 0
    const eyeY = async () => (await eye.boundingBox())?.y ?? 0
    await page.mouse.move(artBox.x + 4, airBox.y + airBox.height / 2)
    await page.waitForTimeout(400)
    const left = await eyeX()
    await page.mouse.move(1430, airBox.y + airBox.height / 2)
    await page.waitForTimeout(400)
    const right = await eyeX()
    await page.mouse.move(airBox.x + airBox.width / 2, artBox.y + 4)
    await page.waitForTimeout(400)
    const up = await eyeY()
    await page.mouse.move(airBox.x + airBox.width / 2, artBox.y + artBox.height - 4)
    await page.waitForTimeout(400)
    const down = await eyeY()
    if (reducedMotion === 'reduce') {
      expect(right - left).toBe(0)
      expect(down - up).toBe(0)
      return
    }
    expect(right - left, 'the eyes look toward the pointer').toBeGreaterThan(2)
    expect(down - up).toBeGreaterThan(2)
    expect(right - left, 'only subtly').toBeLessThan(airBox.width * 0.1)
  })
}
