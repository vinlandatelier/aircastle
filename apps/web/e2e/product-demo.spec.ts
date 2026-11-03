import { test, expect } from './support'

const prompt = "Recently shipped MCP for our app, let's announce it"

test('product preview sits below the hero without a visible label', async ({ page }) => {
  await page.goto('/')
  const preview = page.getByRole('region', { name: 'Aircastle preview' })
  await expect(preview).toBeVisible()
  await expect(preview.getByText('Preview', { exact: true })).toHaveCount(0)
  const heroBox = await page.getByRole('link', { name: 'Get started', exact: true }).boundingBox()
  const previewBox = await preview.boundingBox()
  if (!heroBox || !previewBox) throw new Error('Landing page is not laid out')
  expect(previewBox.y).toBeGreaterThan(heroBox.y + heroBox.height)
})

test('product preview shows the posts collection without motion', async ({ page }) => {
  await page.goto('/')
  const frame = page.getByRole('region', { name: 'Aircastle preview' }).locator('[data-demo-frame]')
  await expect(frame.getByText('Blog posts', { exact: true })).toBeVisible()
  await expect(frame.getByText('How we cut build times by 40%', { exact: true })).toBeVisible()
  await expect(frame.locator('[data-demo-dialog]')).toHaveCount(0)
  expect(await frame.evaluate((element) => element.getAnimations({ subtree: true }).length)).toBe(0)
})

test('product preview mirrors the dashboard shell with a collapsed sidebar', async ({ page }) => {
  await page.goto('/')
  const frame = page.getByRole('region', { name: 'Aircastle preview' }).locator('[data-demo-frame]')
  const header = frame.locator('[data-demo-header]')
  await expect(header).toContainText('Acme Inc')
  await expect(header.getByText('Pro', { exact: true })).toBeVisible()
  await expect(header).toContainText('Acme Platforms')
  await expect(header).toContainText('Connect')
  await expect(header).toContainText('Search...')
  await expect(header).not.toContainText('Upgrade')
  await expect(header).not.toContainText('Free')
  const rail = frame.locator('[data-demo-sidebar]')
  await expect(rail.locator('svg')).toHaveCount(8)
  const railBox = await rail.boundingBox()
  const frameBox = await frame.boundingBox()
  if (!railBox || !frameBox) throw new Error('Preview is not laid out')
  expect(railBox.width / frameBox.width).toBeLessThan(0.06)
})

test('product preview table shows truncated plain-text bodies and a count badge', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const frame = page.getByRole('region', { name: 'Aircastle preview' }).locator('[data-demo-frame]')
  await expect(frame.locator('[data-demo-count]')).toHaveText('7')
  await expect(frame.getByText('Body', { exact: true })).toBeVisible()
  const bodies = frame.locator('[data-demo-body]')
  await expect(bodies).toHaveCount(6)
  const firstBody = bodies.first()
  await expect(firstBody).toHaveCSS('text-overflow', 'ellipsis')
  expect(await firstBody.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
    true,
  )
  await expect(firstBody.locator('*')).toHaveCount(0)
})

test('a ⌘J shortcut opens the agent dialog, the idea is typed and Enter sends it', async ({
  page,
}) => {
  await page.clock.install()
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  const preview = page.getByRole('region', { name: 'Aircastle preview' })
  await preview.scrollIntoViewIfNeeded()
  const frame = preview.locator('[data-demo-frame]')
  const dialog = frame.locator('[data-demo-dialog]')
  const shortcut = frame.locator('[data-demo-shortcut]')
  const typed = dialog.locator('[data-demo-prompt]')

  await expect(dialog).toHaveCount(0)
  await page.clock.runFor(1100)
  await expect(shortcut).toHaveAttribute('data-state', 'shown')
  await expect(shortcut).toContainText('⌘')
  await expect(shortcut).toContainText('J')
  await page.clock.runFor(500)
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Ask agents')
  await expect(typed).toHaveText('')
  await page.clock.runFor(1200)
  const partway = (await typed.textContent()) ?? ''
  expect(partway.length).toBeGreaterThan(0)
  expect(prompt.startsWith(partway)).toBe(true)
  await expect(typed).not.toHaveText(prompt)
  await page.clock.runFor(1500)
  await expect(typed).toHaveText(prompt)
  await expect(shortcut).toHaveAttribute('data-state', 'hidden')
  await page.clock.runFor(200)
  await expect(shortcut).toHaveAttribute('data-state', 'shown')
  await expect(shortcut).toContainText('↵')
  await expect(shortcut).not.toContainText('⌘')
  await expect(dialog.locator('[data-demo-send]')).toHaveAttribute('data-pressed', 'true')
  await page.clock.runFor(700)
  await expect(dialog).toHaveCount(0)

  const agentRow = frame.locator('[data-demo-row="agent"]')
  await expect(agentRow).toHaveAttribute('data-state', 'shown')
  await expect(agentRow).toContainText('Introducing Acme MCP')
  await expect(agentRow).toContainText('Abyan')
  await expect(agentRow).toContainText('Drafting')
  await expect(agentRow).toHaveAttribute('data-agents-working', 'true')
  await expect(frame.locator('[data-demo-count]')).toHaveText('7')
  const agents = frame.locator('[data-demo-agents]')
  await expect(agents.locator('svg')).toHaveCount(2)
  const tabOffset = async () => {
    const rowBox = await agentRow.locator('[data-demo-agent-row]').boundingBox()
    const agentsBox = await agents.boundingBox()
    if (!rowBox || !agentsBox) throw new Error('Agent row is not laid out')
    return {
      attached: Math.abs(agentsBox.y - (rowBox.y + rowBox.height)) <= 1.5,
      left: agentsBox.x < rowBox.x + rowBox.width / 4,
    }
  }
  await expect.poll(tabOffset).toEqual({ attached: true, left: true })
  await expect(agents).toHaveCSS('background-color', 'rgb(139, 92, 246)')
  const gapToNextRow = async () => {
    const rowBox = await agentRow.boundingBox()
    const nextBox = await frame
      .getByText('How we cut build times by 40%', { exact: true })
      .boundingBox()
    if (!rowBox || !nextBox) throw new Error('Rows are not laid out')
    return nextBox.y - (rowBox.y + rowBox.height) < 20
  }
  await expect.poll(gapToNextRow).toBe(true)
})

test('the agent dialog stays closed with reduced motion', async ({ page }) => {
  await page.clock.install()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const frame = page.getByRole('region', { name: 'Aircastle preview' }).locator('[data-demo-frame]')
  await frame.scrollIntoViewIfNeeded()
  await page.clock.runFor(8000)
  await expect(frame.locator('[data-demo-dialog]')).toHaveCount(0)
})

test('product preview has window dots above the header and no frame border', async ({ page }) => {
  await page.goto('/')
  const frame = page.getByRole('region', { name: 'Aircastle preview' }).locator('[data-demo-frame]')
  await expect(frame).toHaveCSS('border-top-width', '0px')
  const dots = frame.locator('[data-demo-window-dots]')
  await expect(dots.locator('> *')).toHaveCount(3)
  await expect(dots).toHaveCSS('border-bottom-width', '0px')
  const dotsBox = await dots.boundingBox()
  const headerBox = await frame.locator('[data-demo-header]').boundingBox()
  if (!dotsBox || !headerBox) throw new Error('Preview is not laid out')
  expect(dotsBox.y + dotsBox.height).toBeLessThanOrEqual(headerBox.y + 0.5)
})
