import { test, expect } from './support'

const prompt = "Recently shipped MCP for our app, let's announce it"

test('product preview sits below the hero without a visible label', async ({ page }) => {
  await page.goto('/')
  const preview = page.getByRole('region', { name: 'Aircastle preview' })
  await expect(preview).toBeVisible()
  await expect(preview.locator(':scope > p').filter({ hasText: /^Preview$/ })).toHaveCount(0)
  const heroBox = await page.getByRole('link', { name: 'Get started', exact: true }).boundingBox()
  const previewBox = await preview.boundingBox()
  if (!heroBox || !previewBox) throw new Error('Landing page is not laid out')
  expect(previewBox.y).toBeGreaterThan(heroBox.y + heroBox.height)
})

test('product preview shows the posts collection without motion', async ({ page }) => {
  await page.goto('/')
  const frame = page.getByRole('region', { name: 'Aircastle preview' }).locator('[data-demo-frame]')
  await expect(
    frame.locator('[data-demo-table]').getByText('Blog posts', { exact: true }),
  ).toBeVisible()
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
  await expect(frame.locator('[data-demo-table]').getByText('Body', { exact: true })).toBeVisible()
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
  await expect(agentRow.getByText('Draft', { exact: true })).toHaveCSS(
    'background-color',
    await frame
      .locator('[data-demo-table]')
      .getByText('Draft', { exact: true })
      .last()
      .evaluate((pill) => getComputedStyle(pill).backgroundColor),
  )
  await expect(agentRow).toHaveAttribute('data-agents-working', 'true')
  await expect(frame.locator('[data-demo-count]')).toHaveText('7')
  const agents = frame.locator('[data-demo-agents]')
  await expect(agents.locator('[data-demo-agent-avatar]')).toHaveCount(4)
  const tabOffset = async () => {
    const rowBox = await agentRow.locator('[data-demo-agent-row]').boundingBox()
    const agentsBox = await agents.boundingBox()
    if (!rowBox || !agentsBox) throw new Error('Agent row is not laid out')
    return {
      attached:
        agentsBox.y < rowBox.y + rowBox.height && agentsBox.y > rowBox.y + rowBox.height - 6,
      left: agentsBox.x < rowBox.x + rowBox.width / 4,
    }
  }
  await expect.poll(tabOffset).toEqual({ attached: true, left: true })
  const tabMatchesOutline = () =>
    agentRow.locator('[data-demo-agent-row]').evaluate((row) => {
      const tab = row.querySelector('[data-demo-agents]')
      if (!tab) return false
      const outline = getComputedStyle(row).boxShadow
      const fill = getComputedStyle(tab).backgroundColor
      return outline.includes(fill)
    })
  const avatarBrightness = new Set<string>()
  for (let sample = 0; sample < 4; sample++) {
    expect(await tabMatchesOutline()).toBe(true)
    avatarBrightness.add(
      await agents
        .locator('> span > span')
        .first()
        .evaluate((avatar) => getComputedStyle(avatar).filter),
    )
    await page.waitForTimeout(350)
  }
  expect(avatarBrightness.size).toBeGreaterThan(1)
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

test('product preview has a bordered window-dots strip above the header and no frame border', async ({
  page,
}) => {
  await page.goto('/')
  const frame = page.getByRole('region', { name: 'Aircastle preview' }).locator('[data-demo-frame]')
  await expect(frame).toHaveCSS('border-top-width', '0px')
  const dots = frame.locator('[data-demo-window-dots]')
  await expect(dots.locator('> *')).toHaveCount(3)
  await expect(dots).toHaveCSS('border-bottom-width', '1px')
  const dotsBox = await dots.boundingBox()
  const headerBox = await frame.locator('[data-demo-header]').boundingBox()
  if (!dotsBox || !headerBox) throw new Error('Preview is not laid out')
  expect(dotsBox.y + dotsBox.height).toBeLessThanOrEqual(headerBox.y + 0.5)
})

test('the cursor hovers the agent row and the agents tab expands to name them', async ({
  page,
}) => {
  await page.clock.install()
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  const frame = page.getByRole('region', { name: 'Aircastle preview' }).locator('[data-demo-frame]')
  await frame.scrollIntoViewIfNeeded()
  const cursor = frame.locator('[data-demo-cursor]')
  const agents = frame.locator('[data-demo-agents]')
  const row = frame.locator('[data-demo-agent-row]')

  const cursorInsideFrame = async () => {
    const cursorBox = await cursor.boundingBox()
    const frameBox = await frame.boundingBox()
    if (!cursorBox || !frameBox) return false
    return (
      cursorBox.x >= frameBox.x &&
      cursorBox.y >= frameBox.y &&
      cursorBox.x + cursorBox.width <= frameBox.x + frameBox.width &&
      cursorBox.y + cursorBox.height <= frameBox.y + frameBox.height
    )
  }
  await expect(cursor).toHaveAttribute('data-state', 'resting')
  await expect(cursor).toHaveCSS('opacity', '1')
  expect(await cursorInsideFrame()).toBe(true)

  await page.clock.runFor(5600)
  await expect(cursor).toHaveAttribute('data-state', 'resting')
  await expect(agents).toHaveAttribute('data-expanded', 'false')

  await page.clock.runFor(2900)
  await expect(cursor).toHaveAttribute('data-state', 'hovering')
  await expect(cursor).toHaveAttribute('data-shape', 'pointer')
  await expect(agents).toHaveAttribute('data-expanded', 'true')
  await expect(agents).toContainText('Thorfinn')
  await expect(agents).toContainText('Canute')
  await expect(agents).toContainText('and 2 others are working')
  await expect(agents).not.toContainText('+2')
  await expect(agents.getByText('Agent', { exact: true })).toHaveCount(2)
  await expect(agents.locator('[data-demo-agent-avatar]')).toHaveCount(4)
  const cursorOnRow = async () => {
    const cursorBox = await cursor.boundingBox()
    const rowBox = await row.boundingBox()
    if (!cursorBox || !rowBox) return false
    return (
      cursorBox.x > rowBox.x &&
      cursorBox.x < rowBox.x + rowBox.width &&
      cursorBox.y > rowBox.y &&
      cursorBox.y < rowBox.y + rowBox.height
    )
  }
  await expect.poll(cursorOnRow).toBe(true)
})

test('the preview table lists authors, with some posts written by several people', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const frame = page.getByRole('region', { name: 'Aircastle preview' }).locator('[data-demo-frame]')
  await expect(
    frame.locator('[data-demo-table]').getByText('Authors', { exact: true }),
  ).toBeVisible()
  await expect(frame.locator('[data-demo-table]').getByText('Author', { exact: true })).toHaveCount(
    0,
  )
  const authorCells = frame.locator('[data-demo-authors]')
  const counts = await authorCells.evaluateAll((cells) =>
    cells.map((cell) => Number(cell.getAttribute('data-demo-authors'))),
  )
  expect(counts.some((count) => count > 1)).toBe(true)
  await expect(frame.locator('[data-demo-authors]').filter({ hasText: /agent/i })).toHaveCount(0)
})

test('the cursor turns into a pointer as soon as it is over any table row', async ({ page }) => {
  await page.clock.install({ time: 0 })
  await page.clock.pauseAt(1000)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  const frame = page.getByRole('region', { name: 'Aircastle preview' }).locator('[data-demo-frame]')
  await frame.scrollIntoViewIfNeeded()
  const cursor = frame.locator('[data-demo-cursor]')
  await expect(cursor).toHaveAttribute('data-shape', 'arrow')
  await page.clock.runFor(6900)
  await expect(cursor).toHaveAttribute('data-state', 'moving')
  await expect(cursor).toHaveAttribute('data-shape', 'pointer')
})

test('clicking the agent row opens the post editor', async ({ page }) => {
  await page.clock.install({ time: 0 })
  await page.clock.pauseAt(1000)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  const frame = page.getByRole('region', { name: 'Aircastle preview' }).locator('[data-demo-frame]')
  await frame.scrollIntoViewIfNeeded()
  const cursor = frame.locator('[data-demo-cursor]')
  const editor = frame.locator('[data-demo-editor]')
  const table = frame.locator('[data-demo-table]')

  await page.clock.runFor(8600)
  await expect(cursor).toHaveAttribute('data-state', 'hovering')
  await expect(editor).toHaveAttribute('data-state', 'hidden')
  await expect(table).toHaveAttribute('data-state', 'shown')

  await page.clock.runFor(800)
  await expect(cursor).toHaveAttribute('data-state', 'clicking')
  await expect(cursor).toHaveAttribute('data-shape', 'pointer')

  await page.clock.runFor(600)
  await expect(editor).toHaveAttribute('data-state', 'shown')
  await expect(table).toHaveAttribute('data-state', 'hidden')
  await expect(editor).toContainText('Introducing Acme MCP')
  await expect(editor.locator('[data-demo-agent-outline]')).toHaveCount(0)
  await expect(editor.getByText('Draft', { exact: true })).toHaveCount(0)

  const preview = editor.locator('[data-demo-preview]')
  const save = editor.locator('[data-demo-save]')
  await expect(preview).toContainText('Preview')
  await expect(preview.locator('svg')).toHaveCount(1)
  await expect(save.locator('svg')).toHaveCount(1)
  await expect(preview).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  const previewBox = await preview.boundingBox()
  const saveBox = await save.boundingBox()
  if (!previewBox || !saveBox) throw new Error('Top bar is not laid out')
  expect(previewBox.x + previewBox.width).toBeLessThanOrEqual(saveBox.x)

  for (const field of ['title', 'slug'])
    await expect(editor.locator(`[data-demo-field="${field}"]`)).toHaveAttribute(
      'data-empty',
      'false',
    )
  for (const field of [
    'summary',
    'body',
    'meta-title',
    'meta-description',
    'focus-keyword',
    'canonical-url',
    'social-image',
    'categories',
    'tags',
    'cover-image',
    'publish-date',
    'reading-time',
  ])
    await expect(editor.locator(`[data-demo-field="${field}"]`)).toHaveAttribute(
      'data-empty',
      'true',
    )

  for (const field of ['categories', 'tags']) {
    const box = editor.locator(`[data-demo-field="${field}"] [data-demo-multiselect]`)
    await expect(box).toHaveAttribute('data-agent', 'Thorfinn')
    await expect(box).toHaveCSS('box-shadow', /inset/)
    const tab = editor.locator(`[data-demo-field="${field}"] [data-demo-agent-tab]`)
    await expect(tab).toContainText('Thorfinn')
    await expect(tab).toContainText('Agent')
    await expect(tab).not.toContainText('Writer')
    const boxRect = await box.boundingBox()
    const tabRect = await tab.boundingBox()
    if (!boxRect || !tabRect) throw new Error('Agent tab is not laid out')
    expect(tabRect.y + tabRect.height).toBeGreaterThan(boxRect.y - 1)
    expect(tabRect.y + tabRect.height).toBeLessThan(boxRect.y + 6)
    expect(boxRect.x + boxRect.width - (tabRect.x + tabRect.width)).toBeLessThan(boxRect.width / 4)
  }
  await expect(editor.locator('[data-demo-field="authors"] [data-demo-multiselect]')).toContainText(
    'Abyan',
  )

  const categories = editor.locator('[data-demo-field="categories"] [data-demo-chip]')
  const tags = editor.locator('[data-demo-field="tags"] [data-demo-chip]')
  await expect(categories).toHaveCount(0)
  await expect(tags).toHaveCount(0)
  await page.clock.runFor(1100)
  await expect(categories).toHaveCount(1)
  await expect(categories.first()).toContainText('Product')
  expect(
    await categories.first().evaluate((chip) => getComputedStyle(chip).animationName),
  ).toContain('agent-arrive')
  await page.clock.runFor(200)
  await expect(categories).toHaveCount(2)
  await expect(categories.last()).toContainText('Announcements')
  await expect(tags).toHaveCount(0)
  await page.clock.runFor(800)
  await expect(tags).toHaveCount(1)
  await expect(tags.first()).toContainText('MCP')
  await page.clock.runFor(400)
  await expect(tags).toHaveCount(3)
  await expect(tags.last()).toContainText('Integrations')
  await expect(editor.locator('[data-demo-field="tags"]')).toHaveAttribute('data-empty', 'false')
  await expect(editor.locator('[data-demo-field="categories"]')).toHaveAttribute(
    'data-empty',
    'false',
  )
})

test('the agents tab starts expanding as soon as the cursor enters the agent row', async ({
  page,
}) => {
  await page.clock.install({ time: 0 })
  await page.clock.pauseAt(1000)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  const frame = page.getByRole('region', { name: 'Aircastle preview' }).locator('[data-demo-frame]')
  await frame.scrollIntoViewIfNeeded()
  const cursor = frame.locator('[data-demo-cursor]')
  const agents = frame.locator('[data-demo-agents]')
  await page.clock.runFor(7300)
  await expect(cursor).toHaveAttribute('data-state', 'moving')
  await expect(agents).toHaveAttribute('data-expanded', 'false')
  await page.clock.runFor(150)
  await expect(cursor).toHaveAttribute('data-state', 'moving')
  await expect(agents).toHaveAttribute('data-expanded', 'true')
})
