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
  const bell = header.locator('[data-demo-notifications] svg.lucide-bell')
  await expect(bell).toHaveCount(1)
  const order = await header.evaluate((element) => {
    const left = (selector: string) =>
      element.querySelector(selector)?.getBoundingClientRect().left ?? -1
    return [
      left('svg.lucide-book-open'),
      left('svg.lucide-sun, svg.lucide-moon'),
      left('[data-demo-notifications]'),
      left('[data-demo-account]'),
    ]
  })
  expect(order.every((value) => value >= 0)).toBe(true)
  expect(order).toEqual([...order].sort((first, second) => first - second))
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
  await expect(agents.getByText('Writing Agent', { exact: true })).toHaveCount(1)
  await expect(agents.getByText('Research Agent', { exact: true })).toHaveCount(1)
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
  await expect(editor.locator('[data-demo-agent-outline]')).toHaveCount(
    await editor.locator('[data-demo-field] [data-demo-agent-outline]').count(),
  )
  await expect(editor.getByText('Draft', { exact: true })).toHaveCount(0)

  const preview = editor.locator('[data-demo-preview]')
  const publish = editor.locator('[data-demo-publish]')
  await expect(preview).toContainText('Preview')
  await expect(preview.locator('svg')).toHaveCount(1)
  await expect(editor.locator('[data-demo-save]')).toHaveCount(0)
  await expect(editor.getByText('Save', { exact: true })).toHaveCount(0)
  await expect(preview).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(preview).toHaveCSS('border-top-width', '1px')
  const previewBox = await preview.boundingBox()
  const publishBox = await publish.boundingBox()
  if (!previewBox || !publishBox) throw new Error('Top bar is not laid out')
  expect(previewBox.x + previewBox.width).toBeLessThanOrEqual(publishBox.x)

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
    const fieldOutline = editor.locator(`[data-demo-field="${field}"] [data-demo-agent-outline]`)
    await expect(fieldOutline).toHaveCSS('box-shadow', /inset/)
    await expect(fieldOutline).toHaveAttribute('data-active', String(field === 'categories'))
    const tab = editor.locator(`[data-demo-field="${field}"] [data-demo-agent-tab]`)
    await expect(tab).toContainText('Thorfinn')
    await expect(tab).toContainText('Writing Agent')
    await expect(tab).not.toContainText('Writer')
    if (field !== 'categories') continue
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
  const presence = (field: string) =>
    editor.locator(`[data-demo-field="${field}"] [data-demo-agent-outline]`)
  const expectWorkingOn = async (field: string | undefined) => {
    for (const candidate of ['categories', 'tags', 'body'])
      await expect(presence(candidate)).toHaveAttribute('data-active', String(candidate === field))
  }
  await expect(categories).toHaveCount(0)
  await expect(tags).toHaveCount(0)
  await expectWorkingOn('categories')

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
  await expectWorkingOn('categories')

  await page.clock.runFor(1300)
  await expectWorkingOn('tags')
  await expect(tags).toHaveCount(0)
  await page.clock.runFor(500)
  await expect(tags).toHaveCount(1)
  await expect(tags.first()).toContainText('MCP')
  await page.clock.runFor(400)
  await expect(tags).toHaveCount(3)
  await expect(tags.last()).toContainText('Integrations')
  await expect(editor.locator('[data-demo-field="tags"]')).toHaveAttribute('data-empty', 'false')

  await page.clock.runFor(1000)
  await expectWorkingOn(undefined)
  await page.clock.runFor(300)
  await expectWorkingOn('body')
  const bodyTab = editor.locator('[data-demo-field="body"] [data-demo-agent-tab]')
  await expect(bodyTab).toHaveAttribute('data-active', 'true')
  await expect(bodyTab).toContainText('Thorfinn')
  await expect(bodyTab).toContainText('Writing Agent')
  await expect(bodyTab).toContainText('Waiting on Canute…')
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

test('the editor top bar shows the source Canute is reading, one after another', async ({
  page,
}) => {
  await page.clock.install({ time: 0 })
  await page.clock.pauseAt(1000)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  const frame = page.getByRole('region', { name: 'Aircastle preview' }).locator('[data-demo-frame]')
  await frame.scrollIntoViewIfNeeded()
  const editor = frame.locator('[data-demo-editor]')
  const research = editor.locator('[data-demo-research]')
  const current = research.locator('[data-demo-source][data-state="current"]')
  await page.clock.runFor(10500)
  await expect(editor).toHaveAttribute('data-state', 'shown')
  await expect(research).toContainText('Canute')
  await expect(research).toContainText('reading')
  await expect(research.getByText('Research Agent', { exact: true })).toBeVisible()
  await expect(research).not.toContainText(/\d+ sources?/)
  await expect(current.locator('[data-demo-source-url]')).toHaveText(
    'modelcontextprotocol.io/specification',
  )
  await expect(current.locator('[data-demo-source-url]')).not.toContainText('https://')
  await expect(current.locator('[data-demo-source-url]')).toHaveCSS('text-overflow', 'ellipsis')
  await expect(current.locator('[data-demo-source-logo]')).toHaveCount(1)
  await expect(
    current.locator('[data-demo-source-logo] svg, svg[data-demo-source-logo]'),
  ).toHaveCount(1)
  const firstWidth = (await research.boundingBox())?.width
  await page.clock.runFor(700)
  await expect(current.locator('[data-demo-source-url]')).toHaveText(
    'github.com/acme/app/pulls?q=mcp+is:merged',
  )
  await page.clock.runFor(700)
  await expect(current.locator('[data-demo-source-url]')).toHaveText('github.com/acme/app/pull/482')
  await page.clock.runFor(800)
  await expect(current.locator('[data-demo-source-url]')).toHaveText(
    'linear.app/acme/issue/ACM-1290',
  )
  expect((await research.boundingBox())?.width).toBe(firstWidth)
  const researchBox = await research.boundingBox()
  const previewBox = await editor.locator('[data-demo-preview]').boundingBox()
  if (!researchBox || !previewBox) throw new Error('Top bar is not laid out')
  expect(researchBox.x + researchBox.width).toBeLessThanOrEqual(previewBox.x)
  await page.clock.runFor(800)
  await expect(current.locator('[data-demo-source-url]')).toHaveText('docs.acme.com/search?q=mcp')
})

test('the cursor opens Canute’s research panel from the top bar', async ({ page }) => {
  await page.clock.install({ time: 0 })
  await page.clock.pauseAt(1000)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  const frame = page.getByRole('region', { name: 'Aircastle preview' }).locator('[data-demo-frame]')
  await frame.scrollIntoViewIfNeeded()
  const editor = frame.locator('[data-demo-editor]')
  const research = editor.locator('[data-demo-research]')
  const panel = editor.locator('[data-demo-research-panel]')
  const cursor = frame.locator('[data-demo-cursor]')

  await page.clock.runFor(12000)
  await expect(panel).toHaveAttribute('data-state', 'closed')
  await expect(research).toHaveAttribute('data-hovered', 'false')
  await expect(cursor).toHaveAttribute('data-state', 'moving')

  await page.clock.runFor(1000)
  await expect(cursor).toHaveAttribute('data-state', 'hovering')
  await expect(cursor).toHaveAttribute('data-shape', 'pointer')
  await expect(research).toHaveAttribute('data-hovered', 'true')

  await page.clock.runFor(600)
  await expect(panel).toHaveAttribute('data-state', 'open')
  await expect(panel).toContainText('Canute')
  await expect(panel.locator('[data-demo-agent-label]')).toHaveText('Research Agent')
  const switcher = panel.locator('[data-demo-panel-header] [data-demo-agent-switcher]')
  await expect(switcher).toContainText('Canute')
  await expect(switcher.locator('svg.lucide-chevron-down')).toHaveCount(1)
  const header = panel.locator('[data-demo-panel-header]')
  await expect(header.locator('svg.lucide-ellipsis')).toHaveCount(1)
  await expect(header.locator('svg.lucide-x')).toHaveCount(0)
  const headerAvatar = switcher.locator('[data-demo-panel-avatar]')
  await expect(headerAvatar).toHaveCSS('filter', 'none')
  await expect(headerAvatar).toHaveCSS('scale', 'none')
  const gap = await switcher.evaluate((element) => {
    const label = element.querySelector('[data-demo-agent-label]')?.getBoundingClientRect()
    const chevron = element.querySelector('svg.lucide-chevron-down')?.getBoundingClientRect()
    return label && chevron ? chevron.left - label.right : -1
  })
  expect(gap).toBeGreaterThanOrEqual(0)
  await expect(panel.locator('[data-demo-thought]').first()).toBeVisible()
  await expect(panel.locator('[data-demo-thought]').first()).toHaveCSS('-webkit-line-clamp', '2')
  await expect(panel).toContainText('No MCP page')
  const request = panel.locator('[data-demo-research-request]')
  await expect(request).toHaveAttribute('data-align', 'end')
  await expect(request).not.toHaveText(prompt)
  await expect(request).toContainText('so Thorfinn can write the announcement post')
  await expect(request.locator('li')).toHaveCount(3)
  await expect(request).toContainText('mark anything you couldn’t confirm')
  const goalColour = await request
    .locator('p')
    .first()
    .evaluate((element) => getComputedStyle(element).color)
  await expect(request.locator('p').last()).toHaveCSS('color', goalColour)
  await expect(request).not.toContainText(/PR #|#482/)
  const sender = panel.locator('[data-demo-research-sender]')
  await expect(sender).toContainText('Air')
  await expect(sender).toContainText('Orchestrator')
  await expect(sender.locator('.air-mascot')).toHaveCount(1)
  const chain = panel.locator('[data-demo-research-chain]')
  await expect(chain.locator('[data-slot="trace-collapsible-trigger"]')).toContainText(
    'Researching',
  )
  await expect(chain.locator('[data-slot="trace-collapsible-trigger"]')).toHaveAttribute(
    'aria-expanded',
    'true',
  )
  const prompter = panel.locator('[data-demo-research-prompt]')
  await expect(prompter).toHaveAttribute('data-slot', 'input-group')
  await expect(prompter.locator('textarea')).toHaveAttribute(
    'placeholder',
    'Ask anything, @tag documents, or / for commands',
  )
  const pending = panel.locator('[data-demo-research-pending]')
  await expect(pending).toHaveText(/Thinking…|Reading|Searching/)
  await expect(pending).toHaveAttribute('data-status', 'running')
  await expect(panel.locator('[data-demo-research-step]').first()).toHaveAttribute(
    'data-slot',
    'trace-line',
  )
  await expect(panel.locator('[data-demo-research-reply]')).toHaveCount(0)
  const marker = panel.locator('[data-demo-research-chain] [data-demo-decision-marker]')
  await expect(marker).toContainText('Asked you: draft a docs page for MCP?')
  await expect(marker).toContainText('Waiting')
  const decision = panel.locator('[data-demo-decision]')
  await expect(decision).toContainText('Draft a docs page for MCP?')
  await expect(decision).toContainText('Connect to Acme MCP')
  await expect(decision).not.toContainText('If not')
  const indent = await decision.evaluate((element) => {
    const left = (selector: string) =>
      element.querySelector(selector)?.getBoundingClientRect().left ?? Number.NaN
    return left('[data-demo-decision-target]') - left('[data-demo-decision-question]')
  })
  expect(Math.abs(indent)).toBeLessThanOrEqual(0.5)
  const replies = decision.locator('[data-demo-decision-option]')
  await expect(replies).toHaveCount(3)
  await expect(replies.nth(0)).toContainText('Yes, draft it')
  await expect(replies.nth(1)).toContainText('Not yet')
  await expect(replies.nth(2)).toContainText('Something else…')
  await expect(decision).not.toContainText('Draft it')
  const replyLayout = await replies.evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect()
      return {
        top: Math.round(box.top),
        left: Math.round(box.left),
        width: Math.round(box.width),
        background: getComputedStyle(element).backgroundColor,
      }
    }),
  )
  expect(replyLayout.map(({ top }) => top)).toEqual(
    replyLayout.map(({ top }) => top).sort((first, second) => first - second),
  )
  expect(new Set(replyLayout.map(({ top }) => top)).size).toBe(3)
  expect(new Set(replyLayout.map(({ left }) => left)).size).toBe(1)
  expect(new Set(replyLayout.map(({ width }) => width)).size).toBe(1)
  const primary = await page.evaluate(() => {
    const probe = document.createElement('span')
    probe.className = 'bg-primary'
    document.body.append(probe)
    const colour = getComputedStyle(probe).backgroundColor
    probe.remove()
    return colour
  })
  expect(replyLayout.every(({ background }) => background !== primary)).toBe(true)
  await expect(panel.locator('[data-demo-research-chain] [data-demo-decision]')).toHaveCount(0)
  const pinnedAbovePrompt = async () =>
    decision.evaluate((element) => {
      const prompt = element.parentElement?.querySelector('[data-demo-research-prompt]')
      return prompt
        ? element.getBoundingClientRect().bottom <= prompt.getBoundingClientRect().top
        : false
    })
  expect(await pinnedAbovePrompt()).toBe(true)

  const tagsBox = await editor.locator('[data-demo-field="tags"]').boundingBox()
  const panelBox = await panel.boundingBox()
  if (!tagsBox || !panelBox) throw new Error('Editor is not laid out')
  expect(tagsBox.x + tagsBox.width).toBeLessThanOrEqual(panelBox.x + 1)
  const editorBox = await editor.boundingBox()
  if (!editorBox) throw new Error('Editor is not laid out')
  expect(Math.abs(panelBox.y - editorBox.y)).toBeLessThanOrEqual(1)
  const publish = editor.locator('[data-demo-publish]')
  await expect
    .poll(async () => {
      const box = await publish.boundingBox()
      return box ? box.x + box.width : Infinity
    })
    .toBeLessThanOrEqual(panelBox.x)
  await expect(research).toHaveAttribute('data-state', 'docked')
  const topBarBox = await editor.locator('[data-demo-top-bar]').boundingBox()
  const panelHeaderBox = await panel.locator('[data-demo-panel-header]').boundingBox()
  if (!topBarBox || !panelHeaderBox) throw new Error('Headers are not laid out')
  expect(
    Math.abs(topBarBox.y + topBarBox.height - (panelHeaderBox.y + panelHeaderBox.height)),
  ).toBeLessThanOrEqual(0.5)
  await expect(research).toBeHidden()
  const breadcrumb = editor.locator('[data-demo-breadcrumb]')
  await expect(breadcrumb).toHaveCSS('white-space', 'nowrap')
  const crumbBox = await breadcrumb.boundingBox()
  const crumbLine = await breadcrumb.evaluate((element) =>
    parseFloat(getComputedStyle(element).lineHeight),
  )
  expect(crumbBox?.height ?? Infinity).toBeLessThanOrEqual(crumbLine + 1)

  const stepsNow = await panel.locator('[data-demo-research-step]').count()
  await page.clock.runFor(1500)
  expect(await panel.locator('[data-demo-research-step]').count()).toBeGreaterThan(stepsNow)

  await page.clock.runFor(1400)
  await expect(panel.locator('[data-demo-research-pending]')).toContainText('Thinking…')

  await page.clock.runFor(5300)
  await expect(panel.locator('[data-demo-research-step]')).toHaveCount(12)
  const reply = panel.locator('[data-demo-research-reply]')
  const words = reply.locator('[data-demo-reply-word]')
  expect(await words.count()).toBeGreaterThan(10)
  const delays = await words.evaluateAll((elements) =>
    elements.map((element) => parseFloat(getComputedStyle(element).animationDelay)),
  )
  expect(delays).toEqual([...delays].sort((left, right) => left - right))
  expect(new Set(delays).size).toBe(delays.length)
  const lastWordDelay = delays.at(-1) ?? 0
  const firstCardDelay = await reply
    .locator('[data-demo-artifact]')
    .first()
    .evaluate((element) => parseFloat(getComputedStyle(element).animationDelay))
  expect(firstCardDelay).toBeGreaterThan(lastWordDelay)
  expect(lastWordDelay).toBeLessThan(1.5)
  await expect(words.last()).toHaveCSS('opacity', '1')
  await expect(reply.locator('.shimmer')).toHaveCount(0)
  const artifacts = panel.locator('[data-demo-artifact]')
  await expect(artifacts).toHaveCount(1)
  await expect(artifacts.first()).toContainText('Research brief.md')
  const artifactIcon = artifacts.first().locator('[data-demo-artifact-icon]')
  await expect(artifactIcon.locator('title')).toHaveText('Markdown')
  const summaryColour = await artifacts
    .first()
    .locator('[data-demo-artifact-summary]')
    .evaluate((element) => getComputedStyle(element).color)
  await expect(artifactIcon).toHaveCSS('color', summaryColour)
  await expect(panel).not.toContainText('Docs gap')
  await expect(panel).not.toContainText('drafted an outline')
  await expect(panel.locator('[data-demo-research-pending]')).toHaveCount(0)
  await expect(panel).not.toContainText('Research complete')
  await expect(panel).not.toContainText('Researching')
  await expect(chain.locator('[data-slot="trace-collapsible-trigger"]')).toContainText(
    'Researched 12 sources',
  )
  await expect(chain.locator('[data-slot="trace-collapsible-trigger"]')).toHaveAttribute(
    'aria-expanded',
    'false',
  )
  await expect(request).toBeInViewport()
  await expect(decision).toBeHidden()
  await expect(marker).toBeAttached()
  await expect(panel.locator('[data-demo-research-reply]')).toContainText(
    'handed a docs page to Air',
  )
  await expect(panel.locator('[data-demo-research-reply]')).toContainText('Research brief.md')
  const agentLabel = panel.locator('[data-demo-agent-label]')
  const mutedText = chain.locator('[data-slot="trace-line"]').first()
  const mutedColour = await mutedText.evaluate((element) => getComputedStyle(element).color)
  await expect(agentLabel).toHaveCSS('color', mutedColour)

  await expect(research).toHaveAttribute('data-state', 'done')
  await expect(research).toBeHidden()
  await expect(editor.locator('[data-demo-preview]')).toBeVisible()
})

test('the preview header has an Ask Air split button with an agent menu', async ({ page }) => {
  await page.clock.install({ time: 0 })
  await page.clock.pauseAt(1000)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  const frame = page.getByRole('region', { name: 'Aircastle preview' }).locator('[data-demo-frame]')
  await frame.scrollIntoViewIfNeeded()
  const header = frame.locator('[data-demo-header]')
  const ask = header.locator('[data-demo-ask]')
  const trigger = header.locator('[data-demo-ask-menu-trigger]')
  const menu = header.locator('[data-demo-ask-menu]')
  const cursor = frame.locator('[data-demo-cursor]')

  await page.clock.runFor(500)
  await expect(ask).toHaveText(/^Ask Air\s*⌘J$/)
  await expect(ask.getByText('⌘J', { exact: true })).toBeVisible()
  const mascot = ask.locator('.air-mascot')
  await expect(mascot).toHaveCount(1)
  await expect(mascot).toHaveCSS('mask-image', /air\.svg/)
  await expect(ask.locator('svg.lucide-bot')).toHaveCount(0)
  await expect(ask.locator('.brand-logo')).toHaveCount(0)
  await expect(trigger.locator('svg.lucide-chevron-down')).toHaveCount(1)
  const askBox = await ask.boundingBox()
  const triggerBox = await trigger.boundingBox()
  const searchBox = await header.locator('[data-demo-search]').boundingBox()
  if (!askBox || !triggerBox || !searchBox) throw new Error('Header is not laid out')
  expect(Math.abs(triggerBox.x - (askBox.x + askBox.width))).toBeLessThanOrEqual(1)
  expect(Math.abs(triggerBox.height - askBox.height)).toBeLessThanOrEqual(1)
  expect(triggerBox.width).toBeLessThanOrEqual(askBox.height + 1)
  expect(triggerBox.x + triggerBox.width).toBeLessThanOrEqual(searchBox.x)
  await expect(menu).toHaveAttribute('data-state', 'closed')

  await page.clock.runFor(10000)
  await expect(frame.locator('[data-demo-editor]')).toHaveAttribute('data-state', 'shown')
  await expect(header.locator('[data-demo-ask-agent]')).toHaveCount(0)
  const waiting = header.locator('[data-demo-ask-count]')
  await expect(waiting).toHaveCount(0)
  await page.clock.runFor(3500)
  await expect(waiting).toHaveText('1')
  const destructive = await page.evaluate(() => {
    const probe = document.createElement('span')
    probe.className = 'bg-destructive'
    document.querySelector('[data-demo-header]')?.append(probe)
    const colour = getComputedStyle(probe).backgroundColor
    probe.remove()
    return colour
  })
  await expect(waiting).toHaveCSS('background-color', destructive)

  for (let tick = 0; tick < 11; tick += 1) {
    await page.clock.runFor(1000)
    await expect(menu).toHaveAttribute('data-state', 'closed')
    await expect(cursor).not.toHaveAttribute('data-target', 'ask')
  }
  const options = menu.locator('[data-demo-ask-option]')
  const optionMascot = options.first().locator('.air-mascot')
  await expect(optionMascot).toHaveCount(1)
  await expect(optionMascot).not.toHaveClass(/rounded-full/)
  const avatarBox = await options.nth(1).locator('svg').first().boundingBox()
  const mascotBox = await optionMascot.boundingBox()
  expect(mascotBox?.width).toBe(avatarBox?.width)
  await expect(options).toHaveCount(5)
  const expected = [
    ['Ask Air', 'Orchestrator'],
    ['Ask Thorfinn', 'Writing Agent'],
    ['Ask Canute', 'Research Agent'],
    ['Ask Askeladd', 'SEO Agent'],
    ['Ask Bjorn', 'Review Agent'],
  ] as const
  for (const [index, [name, role]] of expected.entries()) {
    await expect(options.nth(index).locator('[data-demo-ask-name]')).toHaveText(name)
    await expect(options.nth(index).locator('[data-demo-ask-role]')).toHaveText(role)
  }
})

test('the cursor answers Canute’s decision and Canute hands it to Air', async ({ page }) => {
  await page.clock.install({ time: 0 })
  await page.clock.pauseAt(1000)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  const frame = page.getByRole('region', { name: 'Aircastle preview' }).locator('[data-demo-frame]')
  await frame.scrollIntoViewIfNeeded()
  const panel = frame.locator('[data-demo-research-panel]')
  const decision = panel.locator('[data-demo-decision]')
  const marker = panel.locator('[data-demo-decision-marker]')
  const cursor = frame.locator('[data-demo-cursor]')
  const waiting = frame.locator('[data-demo-ask-count]')

  await page.clock.runFor(14000)
  await expect(decision).toHaveAttribute('data-state', 'asking')
  await expect(waiting).toHaveText('1')

  let hovering = false
  for (let tick = 0; tick < 30 && !hovering; tick += 1) {
    await page.clock.runFor(100)
    hovering =
      (await cursor.getAttribute('data-target')) === 'decision' &&
      (await cursor.getAttribute('data-state')) === 'hovering'
  }
  expect(hovering).toBe(true)
  await expect(cursor).toHaveAttribute('data-shape', 'pointer')
  await expect(decision).toHaveAttribute('data-state', 'asking')

  let sent = false
  for (let tick = 0; tick < 15 && !sent; tick += 1) {
    await page.clock.runFor(100)
    sent = (await decision.getAttribute('data-state')) === 'sent'
  }
  expect(sent).toBe(true)
  await expect(decision).toContainText('Sent to Air')
  await expect(decision).toContainText('Connect to Acme MCP')
  await expect(decision.locator('[data-demo-decision-option]')).toHaveCount(0)
  await expect(decision.locator('.air-mascot')).toHaveCount(1)
  await expect(marker).toContainText('You: Yes, draft it')
  await expect(marker).not.toContainText('Waiting')
  const handoff = panel.locator('[data-demo-research-chain] [data-demo-handoff]')
  await expect(handoff).toContainText('Handed off to')
  await expect(handoff).toContainText('Air')
  await expect(handoff.locator('.air-mascot')).toHaveCount(1)
  await expect(waiting).toHaveCount(0)

  await page.clock.runFor(1000)
  await expect(decision).toBeHidden()
})

test('Thorfinn streams a body draft once Canute’s research is done', async ({ page }) => {
  await page.clock.install({ time: 0 })
  await page.clock.pauseAt(1000)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  const frame = page.getByRole('region', { name: 'Aircastle preview' }).locator('[data-demo-frame]')
  await frame.scrollIntoViewIfNeeded()
  const body = frame.locator('[data-demo-field="body"]')
  const tab = body.locator('[data-demo-agent-tab]')
  const draft = body.locator('[data-demo-body-draft]')

  await page.clock.runFor(19500)
  await expect(tab).toContainText('Waiting on Canute…')
  await expect(draft).toHaveCount(0)

  await page.clock.runFor(2500)
  await expect(tab).toContainText('Writing…')
  await expect(body).toHaveAttribute('data-empty', 'false')
  await expect(draft.locator('h2').first()).toBeVisible()
  await expect(draft.locator('h2')).toHaveCount(4)
  await expect(draft.locator('li')).toHaveCount(7)
  await expect(draft.locator('pre')).toContainText('https://mcp.acme.com')
  await expect(draft).not.toContainText(/[\u2018\u2019\u201c\u201d\u2014]/)
  const words = draft.locator('[data-demo-draft-word]')
  expect(await words.count()).toBeGreaterThan(250)
  const delays = await words.evaluateAll((elements) =>
    elements.map((element) => parseFloat(getComputedStyle(element).animationDelay)),
  )
  expect(delays).toEqual([...delays].sort((first, second) => first - second))
  expect(new Set(delays).size).toBe(delays.length)
  await expect(words.last()).toHaveCSS('opacity', '1', { timeout: 12000 })
  await page.waitForTimeout(300)
  const viewport = body.locator('[data-demo-body-viewport]')
  const following = await viewport.evaluate((element) => {
    const last = element.querySelector('[data-demo-draft-word]:last-of-type, pre')
    const words = element.querySelectorAll('[data-demo-draft-word]')
    const end = words[words.length - 1]?.getBoundingClientRect()
    const box = element.getBoundingClientRect()
    return last && end ? end.bottom <= box.bottom + 1 && end.top >= box.top : false
  })
  expect(following).toBe(true)
})
