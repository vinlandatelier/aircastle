import type { Locator, Page } from '@playwright/test'
import { test, expect, visit, assertLayout, visibleSidebarTrigger } from './support'

const longName = 'W'.repeat(1000)
const multiwordName = 'Long project name '.repeat(60)
const viewports = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 320, height: 800 },
] as const

async function assertBounded(page: Page, element: Locator) {
  await expect(element).toBeVisible()
  await expect(element).toBeInViewport({ ratio: 1 })
  await expect
    .poll(async () => {
      const box = await element.boundingBox()
      const viewport = page.viewportSize()
      return Boolean(
        box &&
        viewport &&
        box.x >= -1 &&
        box.y >= -1 &&
        box.x + box.width <= viewport.width + 1 &&
        box.y + box.height <= viewport.height + 1,
      )
    })
    .toBe(true)
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
    .toBeLessThanOrEqual(1)
}

async function chooseTheme(page: Page, theme: 'Light' | 'Dark') {
  await page.getByRole('button', { name: 'Choose theme', exact: true }).click()
  const menu = page.getByRole('menu', { name: 'Theme', exact: true })
  await assertBounded(page, menu)
  for (const endpoint of ['Light', 'System']) {
    const option = menu.getByRole('menuitemradio', { name: endpoint, exact: true })
    await option.scrollIntoViewIfNeeded()
    await assertBounded(page, option)
  }
  await menu.getByRole('menuitemradio', { name: theme, exact: true }).click()
  await expect(menu).toBeHidden()
  await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme.toLowerCase()}\\b`))
}

async function enlargeText(page: Page) {
  const search = page.getByRole('button', { name: 'Search pages', exact: true })
  const baseline = await search.evaluate((element) => ({
    root: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
    text: Number.parseFloat(getComputedStyle(element).fontSize),
  }))
  await page.evaluate((size) => {
    document.documentElement.style.fontSize = `${size}px`
  }, baseline.root * 2)
  await expect
    .poll(() =>
      page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize)),
    )
    .toBe(baseline.root * 2)
  await expect
    .poll(() => search.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)))
    .toBeGreaterThan(baseline.text)
}

async function exerciseControls(page: Page, scenario: 'normal' | 'long-text') {
  await assertLayout(page)
  const project = page.getByRole('button', { name: /^Switch project:/ })
  await project.click()
  const input = page.getByRole('combobox')
  await expect(input).toBeFocused()
  await assertBounded(page, page.getByRole('dialog', { name: 'Switch project', exact: true }))
  const identity = scenario === 'normal' ? 'Acme Inc / Marketing Site' : `${longName} / ${longName}`
  await input.fill(scenario === 'normal' ? 'Marketing Site' : longName)
  const option = page.getByRole('option', { name: identity, exact: true })
  await expect(option).toHaveAccessibleName(identity)
  await option.click()
  await expect(input).toBeHidden()
  await expect(project).toHaveAccessibleName(`Switch project: ${identity}`)
  await assertLayout(page)

  const account = page.getByRole('button', { name: 'Open account menu', exact: true })
  await account.click()
  const accountMenu = page.getByRole('menu')
  await assertBounded(page, accountMenu)
  await accountMenu.getByRole('menuitem', { name: 'Account', exact: true }).scrollIntoViewIfNeeded()
  await assertBounded(page, accountMenu.getByRole('menuitem', { name: 'Account', exact: true }))
  await accountMenu.getByRole('menuitem', { name: 'Log out', exact: true }).scrollIntoViewIfNeeded()
  await assertBounded(page, accountMenu.getByRole('menuitem', { name: 'Log out', exact: true }))
  await page.keyboard.press('Escape')
  await expect(accountMenu).toBeHidden()
  await expect(account).toBeFocused()

  const search = page.getByRole('button', { name: 'Search pages', exact: true })
  await search.click()
  const searchDialog = page.getByRole('dialog', { name: 'Search pages', exact: true })
  await assertBounded(page, searchDialog)
  const query = searchDialog.getByRole('combobox')
  await expect(query).toBeFocused()
  await query.fill(longName)
  await expect(query).toHaveValue(longName)
  await expect(searchDialog.getByText('No pages found.', { exact: true })).toBeVisible()
  await expect(searchDialog.getByRole('option')).toHaveCount(0)
  await assertBounded(page, searchDialog)
  await query.fill('Users')
  await searchDialog.getByRole('option', { name: 'Users', exact: true }).click()
  await expect(page).toHaveURL(/\/users(?:\?.*)?$/)
  await expect(searchDialog).toBeHidden()

  if (page.viewportSize()!.width < 768) {
    const trigger = visibleSidebarTrigger(page)
    await trigger.click()
    const drawer = page.getByRole('dialog')
    await assertBounded(page, drawer)
    await drawer.getByRole('link', { name: 'Tasks', exact: true }).click()
    await expect(page).toHaveURL(/\/tasks(?:\?.*)?$/)
    await expect(drawer).toBeHidden()
    await expect(trigger).toBeFocused()
  } else {
    await page.getByRole('link', { name: 'Tasks', exact: true }).click()
    await expect(page).toHaveURL(/\/tasks(?:\?.*)?$/)
    const trigger = visibleSidebarTrigger(page)
    await expect(trigger).toHaveAttribute('aria-expanded', /^(true|false)$/)
    const expanded = await trigger.getAttribute('aria-expanded')
    await trigger.click()
    await expect(trigger).toHaveAttribute('aria-expanded', expanded === 'true' ? 'false' : 'true')
    await trigger.click()
    await expect(trigger).toHaveAttribute('aria-expanded', expanded!)
  }
  await expect(project).toHaveAccessibleName(`Switch project: ${identity}`)
  await assertLayout(page)
}

test.afterEach(async ({ page }, testInfo) => {
  if (!page.isClosed()) {
    await testInfo.attach('layout', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
  }
})

for (const scenario of ['normal', 'long-text'] as const) {
  for (const viewport of viewports) {
    for (const theme of ['Light', 'Dark'] as const) {
      test(`T5 R7 R8 ${scenario} ${viewport.width}x${viewport.height} ${theme}: controls and overlays remain reachable`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport)
        await visit(page, scenario)
        await chooseTheme(page, theme)
        await exerciseControls(page, scenario)
      })
    }
  }

  for (const viewport of viewports.slice(0, 2)) {
    for (const theme of ['Light', 'Dark'] as const) {
      test(`T5 R8 ${scenario} ${viewport.width}x${viewport.height} ${theme} doubled-root-font: text grows and controls remain reachable`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport)
        await visit(page, scenario)
        await enlargeText(page)
        await chooseTheme(page, theme)
        await exerciseControls(page, scenario)
      })
    }
  }
}

test('T5 R7 long-text: the separate multiword project retains its complete identity', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await visit(page, 'long-text')
  const project = page.getByRole('button', { name: /^Switch project:/ })
  await project.click()
  await page.getByRole('combobox').fill('Long project name')
  const option = page.getByRole('option').filter({ hasText: multiwordName.trimEnd() })
  await expect(option).toHaveCount(1)
  await expect(option).toHaveAccessibleName(new RegExp(`^.+ / ${multiwordName.trimEnd()}$`))
  expect(await option.textContent()).toContain(multiwordName)
  await option.click()
  await expect(project).toHaveAccessibleName(
    new RegExp(`^Switch project: .+ / ${multiwordName.trimEnd()}$`),
  )
  await expect(page.getByRole('combobox')).toBeHidden()
  await assertLayout(page)
})

for (const [name, query] of [
  ['東京のプロジェクト 🚀', '東京'],
  ['مشروع الاختبار', 'الاختبار'],
  ['Cafe\u0301', 'Cafe\u0301'],
] as const) {
  test(`T5 R7 unicode: exact substring ${query} selects ${name} without changing its string`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 800 })
    await visit(page, 'unicode')
    await chooseTheme(page, 'Dark')
    const project = page.getByRole('button', { name: /^Switch project:/ })
    await project.click()
    const input = page.getByRole('combobox')
    await input.fill(query)
    const option = page.getByRole('option')
    await expect(option).toHaveCount(1)
    await expect(option).toHaveAccessibleName(new RegExp(`^.+ / ${name}$`))
    expect(await option.textContent()).toContain(name)
    await input.press('ArrowDown')
    await input.press('Enter')
    await expect(input).toBeHidden()
    await expect(project).toHaveAccessibleName(new RegExp(`^Switch project: .+ / ${name}$`))
    await assertLayout(page)
  })
}

for (const method of ['keyboard', 'pointer'] as const) {
  for (const endpoint of ['001', '100'] as const) {
    test(`T5 R7 R8 many-projects ${method}: Project ${endpoint} is reachable inside the scrolling popup`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await visit(page, 'many-projects')
      const project = page.getByRole('button', {
        name: 'Switch project: Acme Inc / Technical Blog',
        exact: true,
      })
      await project.click()
      const input = page.getByRole('combobox')
      const list = page.getByRole('listbox')
      const first = list.getByRole('option', { name: 'Acme Inc / Project 001', exact: true })
      const last = list.getByRole('option', { name: 'Acme Inc / Project 100', exact: true })
      await expect(list.getByRole('option')).toHaveCount(100)
      await expect(first).toHaveAccessibleName('Acme Inc / Project 001')
      await expect(last).toHaveAccessibleName('Acme Inc / Project 100')
      expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
        true,
      )
      expect(await list.evaluate((element) => getComputedStyle(element).overflowY)).toMatch(
        /^(auto|scroll)$/,
      )
      const target = endpoint === '001' ? first : last
      if (method === 'keyboard') {
        await expect(input).toBeFocused()
        await input.press(endpoint === '001' ? 'Home' : 'End')
        await expect(target).toHaveAttribute('aria-selected', 'true')
      } else {
        await list.hover()
        const distance = await list.evaluate((element) => element.scrollHeight)
        await page.mouse.wheel(0, endpoint === '001' ? -distance : distance)
      }
      await assertBounded(page, page.getByRole('dialog', { name: 'Switch project', exact: true }))
      await expect
        .poll(() =>
          target.evaluate((element) => {
            const option = element.getBoundingClientRect()
            const listbox = element.closest('[role="listbox"]')!.getBoundingClientRect()
            return option.top >= listbox.top - 1 && option.bottom <= listbox.bottom + 1
          }),
        )
        .toBe(true)
      if (endpoint === '100') {
        await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
      }
      if (method === 'keyboard') {
        await input.press('Enter')
      } else {
        await target.click()
      }
      await expect(input).toBeHidden()
      await expect(project).toHaveAccessibleName(`Switch project: Acme Inc / Project ${endpoint}`)
      await assertLayout(page)
    })
  }
}

test('T5 R7 empty-candidates: empty search preserves the current project, dismissal and focus', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await visit(page, 'empty-candidates')
  const project = page.getByRole('button', {
    name: 'Switch project: Acme Inc / Technical Blog',
    exact: true,
  })
  await project.click()
  for (const query of ['', 'no-such-project-734021', '']) {
    const input = page.getByRole('combobox')
    await input.fill(query)
    await expect(input).toBeFocused()
    await expect(page.getByText('No projects found.', { exact: true })).toBeVisible()
    await expect(page.getByRole('option')).toHaveCount(0)
    await assertBounded(page, page.getByRole('dialog', { name: 'Switch project', exact: true }))
  }
  await page.keyboard.press('Escape')
  await expect(page.getByRole('combobox')).toBeHidden()
  await expect(project).toBeFocused()
  await expect(project).toHaveAccessibleName('Switch project: Acme Inc / Technical Blog')
  await project.click()
  await expect(page.getByText('No projects found.', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(project).toBeFocused()
  await assertLayout(page)
})

for (const scenario of ['normal', 'long-text'] as const) {
  test(`T5 R8 ${scenario} sidebar boundary: 767px drawer and 768px desktop controls remain operable`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 767, height: 844 })
    await visit(page, scenario)
    await assertLayout(page)
    await visibleSidebarTrigger(page).click()
    await expect(
      page.getByRole('dialog').getByRole('link', { name: 'Tasks', exact: true }),
    ).toBeVisible()
    await assertBounded(page, page.getByRole('dialog'))
    await page.keyboard.press('Escape')
    await expect(visibleSidebarTrigger(page)).toBeFocused()
    await page.setViewportSize({ width: 768, height: 844 })
    await expect(page.getByRole('dialog')).toBeHidden()
    const trigger = visibleSidebarTrigger(page)
    await expect(trigger).toHaveAttribute('aria-expanded', /^(true|false)$/)
    const expanded = await trigger.getAttribute('aria-expanded')
    await trigger.click()
    await expect(trigger).toHaveAttribute('aria-expanded', expanded === 'true' ? 'false' : 'true')
    await page.getByRole('link', { name: 'Tasks', exact: true }).click()
    await expect(page).toHaveURL(/\/tasks(?:\?.*)?$/)
    await trigger.click()
    await expect(trigger).toHaveAttribute('aria-expanded', expanded!)
    await assertLayout(page)
  })
}

for (const viewport of viewports) {
  for (const destination of [
    { name: longName, query: longName, path: '/tasks' },
    { name: '東京のプロジェクト 🚀', query: '東京', path: '/users' },
  ] as const) {
    test(`T5 R7 R8 long-navigation ${viewport.width}x${viewport.height} ${destination.path}: sidebar and search preserve destination identity`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport)
      await visit(page, 'long-navigation')
      await chooseTheme(page, viewport.width === 1440 ? 'Light' : 'Dark')
      const mobile = viewport.width < 768
      if (mobile) await visibleSidebarTrigger(page).click()
      const link = page.getByRole('link', { name: destination.name, exact: true })
      await expect(link).toHaveAccessibleName(destination.name)
      await expect(link).toHaveAttribute('href', destination.path)
      await link.scrollIntoViewIfNeeded()
      await assertBounded(page, link)
      await link.click()
      await expect(page).toHaveURL(new RegExp(`${destination.path}(?:\\?.*)?$`))
      if (mobile) {
        await expect(page.getByRole('dialog')).toBeHidden()
        await expect(visibleSidebarTrigger(page)).toBeFocused()
      }
      await assertLayout(page)
      await page.getByRole('link', { name: 'Aircastle', exact: true }).click()
      await expect(page).toHaveURL(/\/collections(?:\?.*)?$/)
      await page.getByRole('button', { name: 'Search pages', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: 'Search pages', exact: true })
      const input = dialog.getByRole('combobox')
      await input.fill(destination.query)
      const option = dialog.getByRole('option', { name: destination.name, exact: true })
      await expect(option).toHaveAccessibleName(destination.name)
      await assertBounded(page, dialog)
      if (mobile) {
        await input.press('ArrowDown')
        await input.press('Enter')
      } else {
        await option.click()
      }
      await expect(dialog).toBeHidden()
      await expect(page).toHaveURL(new RegExp(`${destination.path}(?:\\?.*)?$`))
      if (mobile) await visibleSidebarTrigger(page).click()
      await expect(page.getByRole('link', { name: destination.name, exact: true })).toHaveAttribute(
        'data-active',
        'true',
      )
      if (mobile) await page.keyboard.press('Escape')
      await assertLayout(page)
    })
  }
}
