import { test, expect } from './support'

const prompt = "Recently shipped MCP for our app, let's announce it"

const playbackRate = 1.2

/** Real milliseconds that play this many milliseconds of the preview's timeline. */
function story(timeline: number) {
  return Math.ceil(timeline / playbackRate)
}

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

test('landing content and preview match a Paper-sized column with a shorter frame', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  const heading = await page.getByRole('heading', { level: 1 }).boundingBox()
  const frame = await page
    .getByRole('region', { name: 'Aircastle preview' })
    .locator('[data-demo-frame]')
    .boundingBox()
  if (!heading || !frame) throw new Error('Landing page is not laid out')
  expect(frame.width).toBeGreaterThan(1060)
  expect(frame.width).toBeLessThanOrEqual(1100)
  expect(heading.x).toBeCloseTo(frame.x, 0)
  expect(frame.height / frame.width).toBeLessThan(0.6)
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
  await page.clock.install({ time: 0 })
  await page.clock.pauseAt(1000)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  const preview = page.getByRole('region', { name: 'Aircastle preview' })
  await preview.scrollIntoViewIfNeeded()
  const frame = preview.locator('[data-demo-frame]')
  const dialog = frame.locator('[data-demo-dialog]')
  const shortcut = frame.locator('[data-demo-shortcut]')
  const typed = dialog.locator('[data-demo-prompt]')

  await expect(dialog).toHaveCount(0)
  await page.clock.runFor(story(1100))
  await expect(shortcut).toHaveAttribute('data-state', 'shown')
  await expect(shortcut).toContainText('⌘')
  await expect(shortcut).toContainText('J')
  await page.clock.runFor(story(500))
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Ask agents')
  await expect(typed).toHaveText('')
  await page.clock.runFor(story(1200))
  const partway = (await typed.textContent()) ?? ''
  expect(partway.length).toBeGreaterThan(0)
  expect(prompt.startsWith(partway)).toBe(true)
  await expect(typed).not.toHaveText(prompt)
  await page.clock.runFor(story(1500))
  await expect(typed).toHaveText(prompt)
  await expect(shortcut).toHaveAttribute('data-state', 'hidden')
  const send = dialog.locator('[data-demo-send]')
  for (let tick = 0; tick < 20 && (await send.getAttribute('data-pressed')) !== 'true'; tick += 1)
    await page.clock.runFor(story(50))
  await expect(shortcut).toHaveAttribute('data-state', 'shown')
  await expect(shortcut).toContainText('↵')
  await expect(shortcut).not.toContainText('⌘')
  await expect(dialog.locator('[data-demo-send]')).toHaveAttribute('data-pressed', 'true')
  await page.clock.runFor(story(700))
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
  await expect(agents.locator('[data-demo-agent-avatar]')).toHaveCount(5)
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
  await page.clock.runFor(story(8000))
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

  await page.clock.runFor(story(5600))
  await expect(cursor).toHaveAttribute('data-state', 'resting')
  await expect(agents).toHaveAttribute('data-expanded', 'false')

  await page.clock.runFor(story(2900))
  await expect(cursor).toHaveAttribute('data-state', 'hovering')
  await expect(cursor).toHaveAttribute('data-shape', 'pointer')
  await expect(agents).toHaveAttribute('data-expanded', 'true')
  await expect(agents).toContainText('Thorfinn')
  await expect(agents).toContainText('Canute')
  await expect(agents).toContainText('and 3 others are working')
  await expect(agents).not.toContainText('+3')
  await expect(agents.getByText('Writing Agent', { exact: true })).toHaveCount(1)
  await expect(agents.getByText('Research Agent', { exact: true })).toHaveCount(1)
  await expect(agents.locator('[data-demo-agent-avatar]')).toHaveCount(5)
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
  await page.clock.runFor(story(6900))
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

  await page.clock.runFor(story(8600))
  await expect(cursor).toHaveAttribute('data-state', 'hovering')
  await expect(editor).toHaveAttribute('data-state', 'hidden')
  await expect(table).toHaveAttribute('data-state', 'shown')

  await page.clock.runFor(story(800))
  await expect(cursor).toHaveAttribute('data-state', 'clicking')
  await expect(cursor).toHaveAttribute('data-shape', 'pointer')

  await page.clock.runFor(story(600))
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
  const external = editor.locator('[data-demo-preview-external]')
  await expect(external.locator('svg.lucide-external-link')).toHaveCount(1)
  await expect(preview).toHaveCSS('border-top-right-radius', '0px')
  await expect(external).toHaveCSS('border-top-left-radius', '0px')
  await expect(external).toHaveCSS('border-left-width', '0px')
  const externalBox = await external.boundingBox()
  if (!externalBox) throw new Error('Preview split is not laid out')
  expect(Math.abs(externalBox.x - (previewBox.x + previewBox.width))).toBeLessThanOrEqual(1)
  expect(externalBox.height).toBeCloseTo(previewBox.height, 1)
  expect(externalBox.width).toBeCloseTo(externalBox.height, 1)
  expect(externalBox.x + externalBox.width).toBeLessThanOrEqual(publishBox.x)

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

  await page.clock.runFor(story(1100))
  await expect(categories).toHaveCount(1)
  await expect(categories.first()).toContainText('Product')
  expect(
    await categories.first().evaluate((chip) => getComputedStyle(chip).animationName),
  ).toContain('agent-arrive')
  await page.clock.runFor(story(200))
  await expect(categories).toHaveCount(2)
  await expect(categories.last()).toContainText('Announcements')
  await expect(tags).toHaveCount(0)
  await expectWorkingOn('categories')

  await page.clock.runFor(story(1300))
  await expectWorkingOn('tags')
  await expect(tags).toHaveCount(0)
  await page.clock.runFor(story(500))
  await expect(tags).toHaveCount(1)
  await expect(tags.first()).toContainText('MCP')
  await page.clock.runFor(story(400))
  await expect(tags).toHaveCount(3)
  await expect(tags.last()).toContainText('Integrations')
  await expect(editor.locator('[data-demo-field="tags"]')).toHaveAttribute('data-empty', 'false')

  await page.clock.runFor(story(1000))
  await expectWorkingOn(undefined)
  await page.clock.runFor(story(300))
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
  await page.clock.runFor(story(7300))
  await expect(cursor).toHaveAttribute('data-state', 'moving')
  await expect(agents).toHaveAttribute('data-expanded', 'false')
  await page.clock.runFor(story(150))
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
  await page.clock.runFor(story(10500))
  await expect(editor).toHaveAttribute('data-state', 'shown')
  await expect(research).toContainText('Canute')
  await expect(research).toContainText('reading')
  await expect(research.getByText('Research Agent', { exact: true })).toBeVisible()
  const muted = await editor
    .locator('[data-demo-field="title"] span')
    .first()
    .evaluate((element) => getComputedStyle(element).color)
  await expect(research.getByText('Research Agent', { exact: true })).toHaveCSS('color', muted)
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
  await page.clock.runFor(story(700))
  await expect(current.locator('[data-demo-source-url]')).toHaveText(
    'github.com/acme/app/pulls?q=mcp+is:merged',
  )
  await page.clock.runFor(story(700))
  await expect(current.locator('[data-demo-source-url]')).toHaveText('github.com/acme/app/pull/482')
  await page.clock.runFor(story(800))
  await expect(current.locator('[data-demo-source-url]')).toHaveText(
    'linear.app/acme/issue/ACM-1290',
  )
  expect((await research.boundingBox())?.width).toBe(firstWidth)
  const researchBox = await research.boundingBox()
  const previewBox = await editor.locator('[data-demo-preview]').boundingBox()
  if (!researchBox || !previewBox) throw new Error('Top bar is not laid out')
  expect(researchBox.x + researchBox.width).toBeLessThanOrEqual(previewBox.x)
  await page.clock.runFor(story(800))
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

  await page.clock.runFor(story(12000))
  await expect(panel).toHaveAttribute('data-state', 'closed')
  await expect(research).toHaveAttribute('data-hovered', 'false')
  await expect(cursor).toHaveAttribute('data-state', 'moving')

  await page.clock.runFor(story(1000))
  await expect(cursor).toHaveAttribute('data-state', 'hovering')
  await expect(cursor).toHaveAttribute('data-shape', 'pointer')
  await expect(research).toHaveAttribute('data-hovered', 'true')

  await page.clock.runFor(story(600))
  await expect(panel).toHaveAttribute('data-state', 'open')
  await expect(panel).toContainText('Canute')
  await expect(panel.locator('[data-demo-agent-label]')).toHaveText('Research Agent')
  const switcher = panel.locator('[data-demo-panel-header] [data-demo-agent-switcher]')
  await expect(switcher).toContainText('Canute')
  await expect(switcher.locator('svg.lucide-chevron-down')).toHaveCount(1)
  const header = panel.locator('[data-demo-panel-header]')
  await expect(header.locator('svg.lucide-ellipsis-vertical')).toHaveCount(1)
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
  const briefMention = request.locator('[data-demo-mention]')
  await expect(briefMention).toHaveText('Thorfinn')
  await expect(briefMention.locator('svg')).toHaveCount(1)
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
  await page.clock.runFor(story(1500))
  expect(await panel.locator('[data-demo-research-step]').count()).toBeGreaterThan(stepsNow)
  await expect(panel.locator('[data-demo-research-pending]')).toHaveText(
    /Thinking…|Reading|Searching|Synthesising/,
  )

  await page.clock.runFor(story(6700))
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
  const mention = panel.locator('[data-demo-research-reply] [data-demo-mention]')
  await expect(mention).toHaveText('Air')
  await expect(mention.locator('.air-mascot')).toHaveCount(1)
  await expect(mention).toHaveCSS('border-top-width', '1px')
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

  await page.clock.runFor(story(500))
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

  await page.clock.runFor(story(10000))
  await expect(frame.locator('[data-demo-editor]')).toHaveAttribute('data-state', 'shown')
  await expect(header.locator('[data-demo-ask-agent]')).toHaveCount(0)
  const waiting = header.locator('[data-demo-ask-count]')
  await expect(waiting).toHaveCount(0)
  await page.clock.runFor(story(3500))
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
    await page.clock.runFor(story(1000))
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
  await expect(options).toHaveCount(6)
  const expected = [
    ['Ask Air', 'Orchestrator'],
    ['Ask Thorfinn', 'Writing Agent'],
    ['Ask Canute', 'Research Agent'],
    ['Ask Askeladd', 'SEO Agent'],
    ['Ask Thorkell', 'Review Agent'],
    ['Ask Einar', 'Design Agent'],
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

  await page.clock.runFor(story(14000))
  await expect(decision).toHaveAttribute('data-state', 'asking')
  await expect(waiting).toHaveText('1')

  let hovering = false
  for (let tick = 0; tick < 30 && !hovering; tick += 1) {
    await page.clock.runFor(story(100))
    hovering =
      (await cursor.getAttribute('data-target')) === 'decision' &&
      (await cursor.getAttribute('data-state')) === 'hovering'
  }
  expect(hovering).toBe(true)
  await expect(cursor).toHaveAttribute('data-shape', 'pointer')
  await expect(decision).toHaveAttribute('data-state', 'asking')

  let sent = false
  for (let tick = 0; tick < 15 && !sent; tick += 1) {
    await page.clock.runFor(story(100))
    sent = (await decision.getAttribute('data-state')) === 'sent'
  }
  expect(sent).toBe(true)
  await expect(decision).toContainText('Sent to Air')
  await expect(decision).toContainText('Connect to Acme MCP')
  await expect(decision.locator('[data-demo-decision-option]')).toHaveCount(0)
  await expect(decision.locator('[data-demo-mention] .air-mascot')).toHaveCount(1)
  await expect(marker).toContainText('You: Yes, draft it')
  await expect(marker).not.toContainText('Waiting')
  const handoff = panel.locator('[data-demo-research-chain] [data-demo-handoff]')
  await expect(handoff).toContainText('Handed off to')
  await expect(handoff).toContainText('Air')
  await expect(handoff.locator('[data-demo-mention]')).toHaveText('Air')
  await expect(handoff.locator('[data-demo-mention] .air-mascot')).toHaveCount(1)
  await expect(decision.locator('[data-demo-mention]')).toHaveText('Air')
  await expect(waiting).toHaveCount(0)

  await page.clock.runFor(story(1000))
  await expect(decision).toBeHidden()
})

test('Thorfinn drafts the body at one fixed height and leaves when it is done', async ({
  page,
}) => {
  await page.clock.install({ time: 0 })
  await page.clock.pauseAt(1000)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  const frame = page.getByRole('region', { name: 'Aircastle preview' }).locator('[data-demo-frame]')
  await frame.scrollIntoViewIfNeeded()
  const body = frame.locator('[data-demo-field="body"]')
  const tab = body.locator('[data-demo-agent-tab]')
  const draft = body.locator('[data-demo-body-draft]')
  const readingTime = frame.locator('[data-demo-field="reading-time"]')

  await page.clock.runFor(story(15000))
  await expect(tab).toContainText('Waiting on Canute…')
  await expect(draft).toHaveCount(0)
  await expect(readingTime).toHaveAttribute('data-empty', 'true')
  const emptyHeight = await body.evaluate((element) => element.clientHeight)
  for (let tick = 0; tick < 60 && (await draft.count()) === 0; tick += 1)
    await page.clock.runFor(story(100))
  await expect(tab).toContainText('Writing…')
  const heights: number[] = []
  const counts: number[] = []
  for (let tick = 0; tick < 30; tick += 1) {
    await page.clock.runFor(story(100))
    heights.push(await body.evaluate((element) => element.clientHeight))
    counts.push(await draft.locator('[data-demo-draft-word]').count())
  }
  expect(new Set(heights)).toEqual(new Set([emptyHeight]))
  expect(new Set(counts).size).toBeGreaterThan(10)
  await expect(tab).toHaveAttribute('data-active', 'true')
  await expect(readingTime).toHaveAttribute('data-empty', 'true')
  for (let tick = 0; tick < 40 && (await tab.getAttribute('data-active')) === 'true'; tick += 1)
    await page.clock.runFor(story(100))
  await expect(tab).toHaveAttribute('data-active', 'false')
  await expect(readingTime).toHaveAttribute('data-empty', 'false')
  await expect(readingTime).toContainText(/^Reading time\s*2 min read/)
  expect(await body.evaluate((element) => element.clientHeight)).toBe(emptyHeight)
  await expect(body).toHaveAttribute('data-empty', 'false')
  await expect(draft.locator('h2').first()).toBeVisible()
  await expect(draft.locator('h2')).toHaveCount(4)
  await expect(draft.locator('li')).toHaveCount(7)
  await expect(draft.locator('pre')).toContainText('https://mcp.acme.com')
  await expect(draft).not.toContainText(/[\u2018\u2019\u201c\u201d\u2014]/)
  const words = draft.locator('[data-demo-draft-word]')
  expect(await words.count()).toBeGreaterThan(250)
  await expect(words.last()).toHaveCSS('opacity', '1')
  await page.waitForTimeout(300)
  const viewport = body.locator('[data-demo-body-viewport]')
  const layout = await viewport.evaluate((element) => {
    const box = element.getBoundingClientRect()
    const first = element.querySelector('[data-demo-draft-word]')?.getBoundingClientRect()
    const words = element.querySelectorAll('[data-demo-draft-word]')
    const end = words[words.length - 1]?.getBoundingClientRect()
    return {
      topStays: first ? first.top >= box.top && first.top < box.top + 40 : false,
      restClipped: end ? end.top > box.bottom : false,
      clipped: getComputedStyle(element).overflow === 'hidden',
    }
  })
  expect(layout).toEqual({ topStays: true, restClipped: true, clipped: true })
})

test('Einar generates the cover image with the product cover skill as the editor opens', async ({
  page,
}) => {
  await page.clock.install({ time: 0 })
  await page.clock.pauseAt(1000)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  const frame = page.getByRole('region', { name: 'Aircastle preview' }).locator('[data-demo-frame]')
  await frame.scrollIntoViewIfNeeded()
  const editor = frame.locator('[data-demo-editor]')
  for (let tick = 0; tick < 200; tick += 1) {
    if ((await editor.getAttribute('data-state')) === 'shown') break
    await page.clock.runFor(story(100))
  }
  await expect(editor).toHaveAttribute('data-state', 'shown')
  const field = frame.locator('[data-demo-field="cover-image"]')
  const tab = field.locator('[data-demo-agent-tab]')
  const cover = field.locator('[data-demo-cover]')
  await expect(tab).toHaveAttribute('data-active', 'true')
  await expect(tab).toContainText('Einar')
  await expect(tab.getByText('Design Agent', { exact: true })).toBeVisible()
  const writerTab = frame.locator('[data-demo-field="categories"] [data-demo-agent-tab]')
  await expect(writerTab).toHaveAttribute('data-active', 'true')
  const hue = (element: Element) =>
    getComputedStyle(element).getPropertyValue('--agent-base').trim()
  const einarHue = await tab.evaluate(hue)
  expect(einarHue).not.toBe('')
  expect(einarHue).not.toBe(await writerTab.evaluate(hue))
  expect(await field.locator('[data-demo-agent-outline]').evaluate(hue)).toBe(einarHue)
  const status = field.locator('[data-demo-cover-status]')
  await expect(status).toHaveAttribute('data-active', 'true')
  await expect(status).toHaveText('Using/create-default-product-cover')
  await expect(status.locator('code')).toHaveText('/create-default-product-cover')
  const fits = await field.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    return [...element.querySelectorAll('[data-demo-agent-tab], [data-demo-cover-status]')].every(
      (child) => {
        const box = child.getBoundingClientRect()
        return box.left >= bounds.left && box.right <= bounds.right
      },
    )
  })
  expect(fits).toBe(true)
  await expect(cover).toHaveCount(0)

  await page.clock.runFor(story(1200))
  await expect(cover).toHaveAttribute('data-state', 'generating')
  await expect(tab).toHaveAttribute('data-active', 'true')

  await page.clock.runFor(story(3500))
  await expect(cover).toHaveAttribute('data-state', 'done')
  await expect(tab).toHaveAttribute('data-active', 'false')
  await expect(status).toHaveAttribute('data-active', 'false')
  await expect(cover.locator('[data-demo-cover-title]')).toHaveText('Introducing Acme MCP')
  await expect(cover.locator('[data-demo-cover-date]')).toHaveText('Nov 5, 2026')
  await expect(cover).not.toContainText('Connect Acme')
  const order = await cover.evaluate((element) =>
    ['[data-demo-cover-acme]', '[data-demo-cover-slash]', '[data-demo-cover-mcp]'].map(
      (selector) => element.querySelector(selector)?.getBoundingClientRect().left ?? -1,
    ),
  )
  expect(order.every((left) => left >= 0)).toBe(true)
  expect(order).toEqual([...order].sort((first, second) => first - second))
  await expect(field).toHaveAttribute('data-empty', 'false')
})

test('Abyan’s own photo, served from the app, is the account avatar and his author avatar', async ({
  page,
}) => {
  await page.goto('/')
  const frame = page.getByRole('region', { name: 'Aircastle preview' }).locator('[data-demo-frame]')
  const photos = [
    frame.locator('[data-demo-account] img'),
    frame.locator('[data-demo-agent-row] [data-demo-authors] img'),
    frame.locator('[data-demo-field="authors"] img'),
  ]
  for (const photo of photos) {
    await expect(photo).toHaveAttribute('src', '/demo/abyan.jpg')
    await expect(photo).toHaveAttribute('alt', '')
  }
  const response = await page.request.get('/demo/abyan.jpg')
  expect(response.ok()).toBe(true)
  expect(response.headers()['content-type']).toContain('image/jpeg')
})

test('scrolling starts during cursor travel and SEO agents stream into individual fields', async ({
  page,
}) => {
  await page.clock.install({ time: 0 })
  await page.clock.pauseAt(1000)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  const frame = page.getByRole('region', { name: 'Aircastle preview' }).locator('[data-demo-frame]')
  await frame.scrollIntoViewIfNeeded()
  const panel = frame.locator('[data-demo-research-panel]')
  const decision = panel.locator('[data-demo-decision]')
  const cursor = frame.locator('[data-demo-cursor]')
  const editor = frame.locator('[data-demo-editor]')
  const seo = frame.locator('[data-demo-field="seo"]')
  const title = seo.locator('[data-demo-field="meta-title"]')
  const tab = title.locator('[data-demo-agent-tab]')
  const social = seo.locator('[data-demo-field="social-image"]')

  await page.clock.runFor(story(15000))
  for (let tick = 0; tick < 60; tick += 1) {
    if ((await decision.getAttribute('data-state')) === 'sent') break
    await page.clock.runFor(story(100))
  }
  await expect(decision).toHaveAttribute('data-state', 'sent')
  await expect(editor).toHaveAttribute('data-scrolled', 'false')
  const beforeScroll = await seo.boundingBox()

  for (
    let tick = 0;
    tick < 20 && (await editor.getAttribute('data-scrolled')) !== 'true';
    tick += 1
  )
    await page.clock.runFor(story(100))
  await expect(cursor).toHaveAttribute('data-target', 'editor')
  await expect(cursor).toHaveAttribute('data-state', 'moving')
  await expect(cursor).toHaveAttribute('data-shape', 'arrow')
  const cursorBeforeOverlap = await cursor.boundingBox()
  await page.clock.runFor(story(250))
  const duringScroll = await seo.boundingBox()
  const cursorDuringOverlap = await cursor.boundingBox()
  if (!beforeScroll || !duringScroll || !cursorBeforeOverlap || !cursorDuringOverlap)
    throw new Error('Editor and cursor are not laid out')
  expect(duringScroll.y).toBeLessThan(beforeScroll.y - 5)
  expect(cursorDuringOverlap.x).toBeLessThan(cursorBeforeOverlap.x - 10)
  await expect(cursor).toHaveAttribute('data-state', 'moving')
  await expect(seo.locator(':scope > [data-demo-agent-outline]')).toHaveCount(0)
  await expect(tab).toHaveAttribute('data-active', 'true')
  await expect(social.locator('[data-demo-agent-tab]')).toHaveAttribute('data-active', 'true')
  await expect(social.locator('[data-demo-agent-tab]')).toContainText('Einar')
  await expect(editor).toHaveAttribute('data-scrolled', 'true')
  const partial = new Set<string>()
  for (let tick = 0; tick < 48; tick += 1) {
    for (const [name, complete] of [
      ['meta-title', 'Introducing Acme MCP: connect Acme to your AI tools'],
      [
        'meta-description',
        'Acme MCP lets Claude, Cursor and other AI tools read and update your Acme workspace. Set it up in a few minutes.',
      ],
      ['focus-keyword', 'Acme MCP'],
    ]) {
      const field = seo.locator(`[data-demo-field="${name}"]`)
      const value = await field.locator('[data-demo-seo-value]').textContent()
      if (value && complete?.startsWith(value) && value !== complete) {
        partial.add(name ?? '')
        await expect(field.locator('[data-demo-agent-tab]')).toHaveAttribute('data-active', 'true')
      }
    }
    await page.clock.runFor(story(100))
  }
  expect([...partial].sort()).toEqual(['focus-keyword', 'meta-description', 'meta-title'])
  await expect
    .poll(async () => {
      const seoBox = await seo.boundingBox()
      const frameBox = await frame.boundingBox()
      const bodyBox = await frame.locator('[data-demo-field="body"]').boundingBox()
      if (!seoBox || !frameBox || !bodyBox) return false
      return (
        seoBox.y + seoBox.height <= frameBox.y + frameBox.height &&
        bodyBox.y < frameBox.y + frameBox.height / 2
      )
    })
    .toBe(true)

  await expect(tab).toContainText('Askeladd')
  await expect(tab.getByText('SEO Agent', { exact: true })).toHaveCount(1)
  const hue = (element: Element) =>
    getComputedStyle(element).getPropertyValue('--agent-base').trim()
  const writerHue = await frame
    .locator('[data-demo-field="body"] [data-demo-agent-tab]')
    .evaluate(hue)
  expect(await tab.evaluate(hue)).not.toBe(writerHue)

  for (const name of ['meta-title', 'meta-description', 'focus-keyword']) {
    await expect(seo.locator(`[data-demo-field="${name}"]`)).toHaveAttribute('data-empty', 'false')
  }
  await expect(seo.locator('[data-demo-field="focus-keyword"]')).toContainText('Acme MCP')
  await expect(tab).toHaveAttribute('data-active', 'false')
  await expect(social).toHaveAttribute('data-empty', 'false')
})

test('cursor travel follows a curved path and eases into its destination', async ({ page }) => {
  await page.clock.install({ time: 0 })
  await page.clock.pauseAt(1000)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  const frame = page.getByRole('region', { name: 'Aircastle preview' }).locator('[data-demo-frame]')
  await frame.scrollIntoViewIfNeeded()
  const cursor = frame.locator('[data-demo-cursor]')
  const start = await cursor.boundingBox()
  for (let tick = 0; tick < 90 && (await cursor.getAttribute('data-state')) !== 'moving'; tick += 1)
    await page.clock.runFor(story(100))
  const samples: Awaited<ReturnType<typeof cursor.boundingBox>>[] = []
  for (let tick = 0; tick < 14; tick += 1) {
    samples.push(await cursor.boundingBox())
    await page.clock.runFor(story(100))
  }
  const end = await cursor.boundingBox()
  if (!start || !end) throw new Error('Cursor is not laid out')
  const length = Math.hypot(end.x - start.x, end.y - start.y)
  const deviations = samples.map((point) =>
    point
      ? Math.abs(
          (end.y - start.y) * (point.x - start.x) - (end.x - start.x) * (point.y - start.y),
        ) / length
      : 0,
  )
  expect(Math.max(...deviations)).toBeGreaterThan(10)
  const distances = samples.slice(1).map((point, index) => {
    const previous = samples[index]
    return point && previous ? Math.hypot(point.x - previous.x, point.y - previous.y) : 0
  })
  expect(Math.max(...distances)).toBeGreaterThan((distances[0] ?? 0) * 2)
  expect(Math.max(...distances)).toBeGreaterThan((distances.at(-1) ?? 0) * 2)
})

test('the preview plays a little faster than its timeline, opening the editor before 9 seconds', async ({
  page,
}) => {
  await page.clock.install({ time: 0 })
  await page.clock.pauseAt(1000)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  const frame = page.getByRole('region', { name: 'Aircastle preview' }).locator('[data-demo-frame]')
  await frame.scrollIntoViewIfNeeded()
  const editor = frame.locator('[data-demo-editor]')
  await page.clock.runFor(7000)
  await expect(editor).toHaveAttribute('data-state', 'hidden')
  await page.clock.runFor(1700)
  await expect(editor).toHaveAttribute('data-state', 'shown')
})

test('the cursor heads for Preview once the social image is done, while SEO keeps typing', async ({
  page,
}) => {
  await page.clock.install({ time: 0 })
  await page.clock.pauseAt(1000)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  const frame = page.getByRole('region', { name: 'Aircastle preview' }).locator('[data-demo-frame]')
  await frame.scrollIntoViewIfNeeded()
  const cursor = frame.locator('[data-demo-cursor]')
  const panel = frame.locator('[data-demo-research-panel]')
  const seo = frame.locator('[data-demo-field="seo"]')
  const social = seo.locator('[data-demo-field="social-image"]')
  const authors = frame.locator('[data-demo-field="authors"]')
  const preview = frame.locator('[data-demo-preview]')

  await page.clock.runFor(story(16000))
  for (
    let tick = 0;
    tick < 120 && (await cursor.getAttribute('data-target')) !== 'editor';
    tick += 1
  )
    await page.clock.runFor(story(100))
  await page.clock.runFor(story(1500))
  await expect(cursor).toHaveAttribute('data-target', 'editor')
  const restBox = await cursor.boundingBox()
  const panelBox = await panel.boundingBox()
  if (!restBox || !panelBox) throw new Error('Cursor or panel is not laid out')
  expect(restBox.x).toBeLessThan(panelBox.x)
  expect(restBox.x).toBeGreaterThan(panelBox.x - 120)

  for (let tick = 0; tick < 60 && (await social.getAttribute('data-empty')) === 'true'; tick += 1)
    await page.clock.runFor(story(50))
  await expect(social).toHaveAttribute('data-empty', 'false')
  await expect(cursor).toHaveAttribute('data-target', 'preview')
  await expect(cursor).toHaveAttribute('data-state', 'moving')
  await expect(seo.locator('[data-demo-agent-tab][data-active="true"]')).toHaveCount(1)
  await expect(seo.locator('[data-demo-field="focus-keyword"]')).toHaveAttribute(
    'data-empty',
    'true',
  )

  await page.waitForTimeout(1600)
  const settled = await authors.boundingBox()
  for (let tick = 0; tick < 30 && (await cursor.getAttribute('data-state')) === 'moving'; tick += 1)
    await page.clock.runFor(story(100))
  await expect(cursor).toHaveAttribute('data-state', 'hovering')
  await expect(cursor).toHaveAttribute('data-shape', 'pointer')
  const cursorBox = await cursor.boundingBox()
  const previewBox = await preview.boundingBox()
  if (!cursorBox || !previewBox) throw new Error('Cursor or Preview is not laid out')
  expect(cursorBox.x).toBeGreaterThan(previewBox.x)
  expect(cursorBox.x).toBeLessThan(previewBox.x + previewBox.width)
  expect(cursorBox.y).toBeGreaterThan(previewBox.y)
  expect(cursorBox.y).toBeLessThan(previewBox.y + previewBox.height)

  for (
    let tick = 0;
    tick < 10 && (await cursor.getAttribute('data-state')) !== 'clicking';
    tick += 1
  )
    await page.clock.runFor(story(100))
  await expect(cursor).toHaveAttribute('data-state', 'clicking')
  await expect(frame.locator('[data-demo-editor]')).toHaveAttribute('data-state', 'shown')
  expect(await authors.boundingBox()).toEqual(settled)
})

async function openSitePreview(page: import('@playwright/test').Page, theme: 'light' | 'dark') {
  await page.addInitScript((value) => localStorage.setItem('aircastle-theme', value), theme)
  await page.clock.install({ time: 0 })
  await page.clock.pauseAt(1000)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  const frame = page.getByRole('region', { name: 'Aircastle preview' }).locator('[data-demo-frame]')
  await frame.scrollIntoViewIfNeeded()
  const site = frame.locator('[data-demo-site-preview]')
  await page.clock.runFor(story(17000))
  for (let tick = 0; tick < 120 && (await site.count()) === 0; tick += 1)
    await page.clock.runFor(story(100))
  await expect(site).toHaveCount(1)
  await page.waitForTimeout(400)
  return { frame, site }
}

function lightness(colour: string) {
  const match = /oklch\(([\d.]+)/.exec(colour) ?? /oklab\(([\d.]+)/.exec(colour)
  if (match?.[1]) return Number(match[1])
  const rgb = /rgba?\((\d+), (\d+), (\d+)/.exec(colour)
  if (!rgb) throw new Error(`Unreadable colour ${colour}`)
  return (Number(rgb[1]) + Number(rgb[2]) + Number(rgb[3])) / 765
}

for (const theme of ['light', 'dark'] as const) {
  test(`the site preview sits flush in the shell with a ${theme} browser bar`, async ({ page }) => {
    const { frame, site } = await openSitePreview(page, theme)
    const topBar = await frame.locator('[data-demo-top-bar]').boundingBox()
    const chrome = site.locator('[data-demo-site-chrome]')
    const siteBox = await site.locator('[data-demo-site-window]').boundingBox()
    const panel = await frame.locator('[data-demo-research-panel]').boundingBox()
    const sidebar = await frame.locator('[data-demo-sidebar]').boundingBox()
    if (!topBar || !siteBox || !panel || !sidebar) throw new Error('Preview is not laid out')
    expect(Math.abs(siteBox.y - (topBar.y + topBar.height))).toBeLessThanOrEqual(1)
    expect(Math.abs(siteBox.x - (sidebar.x + sidebar.width))).toBeLessThanOrEqual(1)
    expect(Math.abs(siteBox.x + siteBox.width - panel.x)).toBeLessThanOrEqual(1)
    await expect(site.locator('[data-demo-site-window]')).toHaveCSS('border-top-left-radius', '0px')
    const bar = lightness(
      await chrome.evaluate((element) => getComputedStyle(element).backgroundColor),
    )
    const field = lightness(
      await site
        .locator('[data-demo-site-field]')
        .evaluate((element) => getComputedStyle(element).backgroundColor),
    )
    if (theme === 'dark') expect(field).toBeGreaterThan(bar)
    else expect(field).toBeLessThan(bar)
    await page.clock.runFor(story(800))
    const sitePage = site.locator('[data-demo-site-page]')
    const pageLightness = lightness(
      await sitePage.evaluate((element) => getComputedStyle(element).backgroundColor),
    )
    const titleLightness = lightness(
      await sitePage.locator('h1').evaluate((element) => getComputedStyle(element).color),
    )
    if (theme === 'dark') {
      expect(pageLightness).toBeLessThan(0.3)
      expect(titleLightness).toBeGreaterThan(0.8)
    } else {
      expect(pageLightness).toBeGreaterThan(0.9)
      expect(titleLightness).toBeLessThan(0.3)
    }
  })
}

test('clicking Preview swaps the editor for the Acme site, address bar first, then the page', async ({
  page,
}) => {
  await page.clock.install({ time: 0 })
  await page.clock.pauseAt(1000)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  const frame = page.getByRole('region', { name: 'Aircastle preview' }).locator('[data-demo-frame]')
  await frame.scrollIntoViewIfNeeded()
  const cursor = frame.locator('[data-demo-cursor]')
  const editor = frame.locator('[data-demo-editor]')
  const site = editor.locator('[data-demo-site-preview]')
  const address = site.locator('[data-demo-site-address]')
  const sitePage = site.locator('[data-demo-site-page]')
  const preview = editor.locator('[data-demo-preview]')

  await page.clock.runFor(story(17000))
  for (
    let tick = 0;
    tick < 80 && (await cursor.getAttribute('data-state')) !== 'clicking';
    tick += 1
  )
    await page.clock.runFor(story(100))
  await expect(cursor).toHaveAttribute('data-state', 'clicking')
  await expect(site).toHaveCount(0)
  await expect(preview).toContainText('Preview')

  for (let tick = 0; tick < 10 && (await site.count()) === 0; tick += 1)
    await page.clock.runFor(story(50))
  await expect(address).toHaveText('acme.com/blog/introducing-acme-mcp')
  await expect(site).not.toContainText('Draft')
  await expect(sitePage).toHaveAttribute('data-state', 'loading')
  await expect(sitePage).not.toContainText('Introducing Acme MCP')
  await expect(preview).toHaveText('Close Preview')
  await expect(preview.locator('svg.lucide-x')).toHaveCount(1)
  await expect(site.locator('[data-demo-site-close] svg.lucide-x')).toHaveCount(1)
  const refresh = await site.locator('svg.lucide-rotate-cw').boundingBox()
  const close = await site.locator('[data-demo-site-close]').boundingBox()
  if (!refresh || !close) throw new Error('Browser bar is not laid out')
  expect(close.x).toBeGreaterThan(refresh.x + refresh.width)
  await expect(editor.locator('[data-demo-editor-scroll]')).toHaveAttribute('data-hidden', 'true')
  await expect(editor.locator('[data-demo-top-bar]')).toBeVisible()
  await expect(frame.locator('[data-demo-research-panel]')).toHaveAttribute('data-state', 'open')

  await page.clock.runFor(story(800))
  await expect(sitePage).toHaveAttribute('data-state', 'loaded')
  await expect(sitePage.locator('h1')).toHaveText('Introducing Acme MCP')
  await expect(sitePage.locator('[data-demo-cover-title]')).toHaveText('Introducing Acme MCP')
  const words = sitePage.locator('[data-demo-draft-word]')
  const early = await words.count()
  expect(early).toBeGreaterThan(250)
  await page.clock.runFor(story(1000))
  expect(await words.count()).toBe(early)
})

test('Thorfinn has started the body by the time the editor scrolls down', async ({ page }) => {
  await page.clock.install({ time: 0 })
  await page.clock.pauseAt(1000)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  const frame = page.getByRole('region', { name: 'Aircastle preview' }).locator('[data-demo-frame]')
  await frame.scrollIntoViewIfNeeded()
  const editor = frame.locator('[data-demo-editor]')
  const words = frame.locator('[data-demo-field="body"] [data-demo-draft-word]')
  await page.clock.runFor(story(14000))
  for (
    let tick = 0;
    tick < 80 && (await editor.getAttribute('data-scrolled')) !== 'true';
    tick += 1
  )
    await page.clock.runFor(story(50))
  await expect(editor).toHaveAttribute('data-scrolled', 'true')
  expect(await words.count()).toBeGreaterThan(0)
  await expect(frame.locator('[data-demo-research-panel]')).toContainText('Researched 12 sources')
})

test('the site cover is the same image as the editor cover, only larger', async ({ page }) => {
  const { frame, site } = await openSitePreview(page, 'light')
  await page.clock.runFor(story(800))
  const proportions = (container: import('@playwright/test').Locator) =>
    container.evaluate((element) => {
      const title = element.querySelector<HTMLElement>('[data-demo-cover-title]')
      if (!title) return null
      const width = element.getBoundingClientRect().width
      return {
        title: title.getBoundingClientRect().width / width,
        font: parseFloat(getComputedStyle(title).fontSize) / element.clientWidth,
      }
    })
  const editorCover = await proportions(
    frame.locator('[data-demo-field="cover-image"] [data-demo-cover]'),
  )
  const siteCover = await proportions(site.locator('[data-demo-site-cover]'))
  if (!editorCover || !siteCover) throw new Error('Covers are not rendered')
  expect(siteCover.title).toBeCloseTo(editorCover.title, 1)
  expect(siteCover.font).toBeCloseTo(editorCover.font, 2)
  const socialCover = await proportions(
    frame.locator('[data-demo-field="social-image"] [data-demo-social-cover]'),
  )
  if (!socialCover) throw new Error('Social image is not rendered')
  expect(socialCover.title).toBeCloseTo(editorCover.title, 1)
  const socialBox = await frame
    .locator('[data-demo-field="social-image"] [data-demo-social-cover]')
    .evaluate((element) => element.clientWidth / element.clientHeight)
  expect(socialBox).toBeCloseTo(1200 / 630, 1)
})

test('the Acme brand and the post title use a medium weight', async ({ page }) => {
  const { site } = await openSitePreview(page, 'light')
  const weight = (locator: import('@playwright/test').Locator) =>
    locator.evaluate((element) => getComputedStyle(element).fontWeight)
  await page.clock.runFor(story(800))

  await expect(site.locator('[data-demo-site-page] h1')).toHaveText('Introducing Acme MCP')
  expect(await weight(site.locator('[data-demo-site-page] h1'))).toBe('500')
  expect(await weight(site.getByText('Acme', { exact: true }).first())).toBe('500')
})

const openingLine =
  'Acme MCP lets any MCP client read and act on your workspace, with the same permissions as the person using it.'
const askInstruction = 'hm maybe lead with what a team can do with it'
const rewrittenLine =
  'Ask Claude to find every stale draft in your workspace, and it works in Acme the way you would, with your permissions.'

test('selecting the opening line on the site asks Air, and Thorkell and Thorfinn rewrite it in place', async ({
  page,
}) => {
  test.setTimeout(90_000)
  const { frame, site } = await openSitePreview(page, 'light')
  const cursor = frame.locator('[data-demo-cursor]')
  const sitePage = site.locator('[data-demo-site-page]')
  const opening = sitePage.locator('[data-demo-site-opening]')
  const selection = sitePage.locator('[data-demo-site-selection]')
  const ask = site.locator('[data-demo-ask-air]')
  const askInput = ask.locator('[data-demo-ask-input]')
  const panel = frame.locator('[data-demo-research-panel]')
  const messages = panel.locator('[data-demo-chat-message]')
  const thread = panel.locator('[data-demo-thread-message]')
  const until = async (done: () => Promise<boolean>) => {
    for (let tick = 0; tick < 300 && !(await done()); tick += 1) await page.clock.runFor(story(50))
  }
  const box = async (locator: import('@playwright/test').Locator) => {
    const found = await locator.boundingBox()
    if (!found) throw new Error('Element is not laid out')
    return found
  }

  await page.clock.runFor(story(800))
  await expect(opening).toHaveText(openingLine)
  const unscrolled = await box(opening)

  const scrolled: number[] = []
  let cursorOverPage = false
  for (let tick = 0; tick < 300 && (await selection.count()) === 0; tick += 1) {
    scrolled.push((await box(opening)).y)
    const pointer = await box(cursor)
    const pageNow = await box(sitePage)
    if (
      scrolled.length > 1 &&
      scrolled.at(-1) !== scrolled.at(-2) &&
      pointer.y > pageNow.y &&
      pointer.y < pageNow.y + pageNow.height
    )
      cursorOverPage = true
    await page.clock.runFor(story(50))
  }
  const settledAt = scrolled.at(-1) ?? 0
  expect(Math.min(...scrolled)).toBeLessThan(settledAt - 80)
  expect(scrolled.slice(-4).every((y) => y === settledAt)).toBe(true)
  expect(cursorOverPage).toBe(true)
  await expect(cursor).toHaveAttribute('data-shape', 'text')
  await until(async () => (await selection.textContent()) === openingLine)
  await expect(selection).toHaveText(openingLine)
  const selected = await box(opening)
  const pageBox = await box(sitePage)
  expect(selected.y).toBeLessThan(unscrolled.y - 100)
  expect(selected.y).toBeGreaterThan(pageBox.y)
  const end = await box(cursor)
  const lastLine = await selection.evaluate((element) => {
    const rect = [...element.getClientRects()].at(-1)
    if (!rect) throw new Error('Selection is not laid out')
    return { right: rect.right, top: rect.top, bottom: rect.bottom }
  })
  expect(Math.abs(end.x + end.width / 2 - lastLine.right)).toBeLessThan(16)
  expect(end.y).toBeLessThan(lastLine.bottom)
  expect(end.y + end.height).toBeGreaterThan(lastLine.top)

  await until(async () => (await ask.count()) > 0)
  await expect(ask.locator('.air-mascot')).toHaveCount(1)
  await expect(ask.locator('[data-demo-ask-label]')).toHaveText('Ask Air')
  await expect(ask.locator('[data-demo-ask-send]')).toHaveCount(1)
  const dropdown = await box(ask)
  expect(dropdown.y).toBeGreaterThan(selected.y + selected.height - 4)
  expect(dropdown.y + dropdown.height).toBeLessThan(pageBox.y + pageBox.height)
  await expect(askInput).toHaveText('')
  const field = await box(askInput)
  const sendButton = await box(ask.locator('[data-demo-ask-send]'))
  expect(field.height).toBeGreaterThan(sendButton.height * 1.4)
  expect(sendButton.y).toBeGreaterThan(field.y + 16)
  expect(sendButton.x + sendButton.width).toBeGreaterThan(dropdown.x + dropdown.width - 24)

  await expect(ask.locator('[data-demo-ask-caret]')).toHaveCount(1)
  let clickedBeforeTyped = false
  for (let tick = 0; tick < 300 && (await askInput.textContent()) !== askInstruction; tick += 1) {
    if ((await cursor.getAttribute('data-state')) === 'clicking') clickedBeforeTyped = true
    await page.clock.runFor(story(50))
  }
  expect(clickedBeforeTyped).toBe(false)
  await until(async () => (await askInput.textContent()) === askInstruction)
  await expect(askInput).toHaveText(askInstruction)
  await expect(panel.locator('[data-demo-agent-switcher]')).toContainText('Canute')

  await until(async () => (await cursor.getAttribute('data-state')) === 'clicking')
  const sendClick = await box(cursor)
  const send = await box(ask.locator('[data-demo-ask-send]'))
  expect(sendClick.x).toBeGreaterThan(send.x - 4)
  expect(sendClick.x).toBeLessThan(send.x + send.width)
  expect(sendClick.y).toBeGreaterThan(send.y - 4)
  expect(sendClick.y).toBeLessThan(send.y + send.height)

  await until(async () => (await ask.count()) === 0)
  await expect(ask).toHaveCount(0)
  const switcher = panel.locator('[data-demo-agent-switcher]')
  await expect(switcher).toContainText('Air')
  await expect(switcher.locator('[data-demo-agent-label]')).toHaveText('Orchestrator')
  await expect(switcher.locator('.air-mascot')).toHaveCount(1)
  expect(await messages.count()).toBeGreaterThanOrEqual(3)
  const latest = messages.last()
  await expect(latest).toHaveAttribute('data-from', 'user')
  await expect(latest).toContainText(askInstruction)
  await expect(latest.locator('[data-demo-chat-quote]')).toHaveText(openingLine)
  await expect(messages.first()).toHaveAttribute('data-from', 'user')
  await expect(messages.first()).toContainText(prompt)
  await expect(selection).toHaveText(openingLine)

  await until(async () => (await panel.locator('[data-demo-delegation]').count()) > 0)
  await expect(panel.locator('[data-demo-delegation]')).toContainText('Thorkell')
  await expect(panel.locator('[data-demo-chat-thinking]')).toHaveCount(0)
  await until(async () => (await thread.count()) > 0)
  await expect(thread.first()).toContainText('Thorkell')
  await expect(thread.first()).toContainText('Review Agent')

  await until(async () => (await selection.count()) === 0)
  await expect(opening).not.toContainText('lets any MCP client')
  await page.clock.runFor(story(450))
  const inked = opening.locator('[data-demo-rewrite-word]')
  const opacityOf = (locator: import('@playwright/test').Locator) =>
    locator.evaluate((element) => Number(getComputedStyle(element).opacity))
  expect(await inked.count()).toBeLessThan(rewrittenLine.split(' ').length)
  expect(await opacityOf(inked.first())).toBe(1)
  expect(await opacityOf(inked.last())).toBeLessThan(0.7)
  await expect(thread.nth(1)).toContainText('Thorfinn')
  await expect(thread.nth(1)).toContainText('Writing Agent')
  await until(async () => (await opening.textContent()) === rewrittenLine)
  await expect(opening).toHaveText(rewrittenLine)
  await page.clock.runFor(story(600))
  for (const word of await inked.all()) expect(await opacityOf(word)).toBe(1)
  await expect(site.locator('[data-demo-agent-tab]')).toHaveCount(0)
  await expect(site.locator('[data-demo-agent-outline]')).toHaveCount(0)

  await until(async () => (await panel.locator('[data-demo-review-finished]').count()) > 0)
  await expect(thread).toHaveCount(3)
  await expect(thread.nth(2)).toContainText('Thorkell')
  await expect(panel.locator('[data-demo-review-finished]')).toContainText('Thorkell')
  await until(async () => (await messages.last().textContent())?.includes('Have a look') ?? false)
  await expect(messages.last()).toHaveAttribute('data-from', 'air')
  await expect(messages.last()).toContainText('Have a look')
  const colourOf = (locator: import('@playwright/test').Locator) =>
    locator.evaluate((element) => getComputedStyle(element).color)
  const airText = lightness(await colourOf(messages.last().locator('p')))
  for (const part of await thread.locator('[data-demo-thread-name], [data-demo-thread-text]').all())
    expect(lightness(await colourOf(part))).toBeGreaterThan(airText + 0.2)
  await expect(thread.locator('[data-demo-thread-text]')).toHaveCount(3)
})
