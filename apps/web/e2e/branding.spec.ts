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

test('sign-in art is the same warm cloud field in light and dark, with a modest logo and name', async ({
  page,
}) => {
  const looks: { left: number[]; right: number[] }[] = []
  for (const theme of ['light', 'dark'] as const) {
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
      key: themeStorageKey,
      value: theme,
    })
    await page.goto('/sign-in')
    await expect(page.getByRole('heading', { name: 'Sign in to Aircastle' })).toBeVisible()
    const art = page.locator('[data-sign-in-art]')
    await expect(art).toBeVisible()
    await expect(art).toHaveAttribute('aria-hidden', 'true')
    await expect(art.locator('feTurbulence')).toHaveCount(1)
    const name = art.getByText('Aircastle', { exact: true })
    await expect(name).toHaveCSS('color', 'rgb(255, 255, 255)')
    expect(
      parseFloat(await name.evaluate((element) => getComputedStyle(element).fontSize)),
    ).toBeLessThanOrEqual(28)
    const mark = await art.locator('[data-sign-in-mark]').boundingBox()
    expect(mark?.width ?? Infinity).toBeLessThanOrEqual(36)
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
        return { left: average(0.02, 0.2), right: average(0.88, 0.6) }
      }, shot),
    )
  }
  const [light, dark] = looks
  if (!light || !dark) throw new Error('Both themes were not captured')
  const [red = 0, , blue = 0] = light.left
  expect(red - blue, 'warm orange on the left').toBeGreaterThan(60)
  for (const side of ['left', 'right'] as const)
    for (const channel of [0, 1, 2])
      expect(
        Math.abs((light[side][channel] ?? 0) - (dark[side][channel] ?? 0)),
        'the art does not change with the theme',
      ).toBeLessThan(4)
})
