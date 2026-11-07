import type { Page } from '@playwright/test'
import { test, expect, visit } from './support'
import { themeStorageKey } from '../src/theme'

test.use({ viewport: { width: 1440, height: 900 } })

async function selectTheme(page: Page, name: 'Dark' | 'Light' | 'System') {
  await page.getByRole('button', { name: 'Choose theme' }).click()
  await page.getByRole('menuitemradio', { name, exact: true }).click()
  await expect(page.getByRole('menu')).toBeHidden()
}

async function expectTheme(page: Page, applied: 'dark' | 'light', stored: string) {
  await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${applied}\\b`))
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), themeStorageKey))
    .toBe(stored)
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    'href',
    `/brand/favicon-${applied}.svg`,
  )
  const icon = await page.evaluate(async (href) => {
    const response = await fetch(href)
    return {
      ok: response.ok,
      type: response.headers.get('content-type'),
      body: await response.text(),
    }
  }, `/brand/favicon-${applied}.svg`)
  expect(icon.ok, `browser loads the ${applied} favicon`).toBe(true)
  expect(icon.type).toContain('image/svg+xml')
  expect(icon.body).toContain('<svg')
}

async function shellColors(page: Page) {
  return page.getByRole('banner').evaluate((element) => {
    const style = getComputedStyle(element)
    return { background: style.backgroundColor, foreground: style.color }
  })
}

test('explicit Dark and Light change rendered colors, radio, storage and favicon and survive reload', async ({
  page,
}) => {
  await visit(page)
  await selectTheme(page, 'Dark')
  await expectTheme(page, 'dark', 'dark')
  const dark = await shellColors(page)
  expect(dark.background).not.toBe('rgba(0, 0, 0, 0)')
  await page.getByRole('button', { name: 'Choose theme' }).click()
  await expect(page.getByRole('menuitemradio', { name: 'Dark', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await expect(page.getByRole('menuitemradio', { name: 'Light', exact: true })).toHaveAttribute(
    'aria-checked',
    'false',
  )
  await page.keyboard.press('Escape')
  await page.reload()
  await expectTheme(page, 'dark', 'dark')
  await expect.poll(() => shellColors(page)).toEqual(dark)

  await selectTheme(page, 'Light')
  await expectTheme(page, 'light', 'light')
  await expect.poll(async () => (await shellColors(page)).background).not.toBe(dark.background)
  await expect.poll(async () => (await shellColors(page)).foreground).not.toBe(dark.foreground)
  const light = await shellColors(page)
  await page.getByRole('button', { name: 'Choose theme' }).click()
  await expect(page.getByRole('menuitemradio', { name: 'Light', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await expect(page.getByRole('menuitemradio', { name: 'Dark', exact: true })).toHaveAttribute(
    'aria-checked',
    'false',
  )
  await page.keyboard.press('Escape')
  await page.reload()
  await expectTheme(page, 'light', 'light')
  await expect.poll(() => shellColors(page)).toEqual(light)
})

test('System follows live browser preference without replacing stored System selection', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await visit(page)
  await selectTheme(page, 'System')
  await expectTheme(page, 'light', 'system')
  const light = await shellColors(page)
  await page.emulateMedia({ colorScheme: 'dark' })
  await expectTheme(page, 'dark', 'system')
  await expect.poll(async () => (await shellColors(page)).background).not.toBe(light.background)
  await expect.poll(async () => (await shellColors(page)).foreground).not.toBe(light.foreground)
  await page.getByRole('button', { name: 'Choose theme' }).click()
  await expect(page.getByRole('menuitemradio', { name: 'System', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await page.keyboard.press('Escape')
  await page.emulateMedia({ colorScheme: 'light' })
  await expectTheme(page, 'light', 'system')
  await expect.poll(() => shellColors(page)).toEqual(light)
  await page.reload()
  await expectTheme(page, 'light', 'system')
})

test('a fresh context does not inherit explicit theme selection', async ({ page, browser }) => {
  await visit(page)
  await selectTheme(page, 'Dark')
  await expectTheme(page, 'dark', 'dark')
  const fresh = await browser.newContext({ colorScheme: 'light' })
  try {
    const other = await fresh.newPage()
    await visit(other)
    await expect(other.locator('html')).toHaveClass(/\blight\b/)
    await expect
      .poll(() => other.evaluate((key) => localStorage.getItem(key), themeStorageKey))
      .not.toBe('dark')
    await other.getByRole('button', { name: 'Choose theme' }).click()
    await expect(other.getByRole('menuitemradio', { name: 'System', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await other.keyboard.press('Escape')
    await expectTheme(page, 'dark', 'dark')
  } finally {
    await fresh.close()
  }
})

test('project filtering selects Marketing Site, closes and excludes the current project', async ({
  page,
}) => {
  await visit(page)
  const initial = page.getByRole('button', {
    name: 'Switch project: Acme Inc / Technical Blog',
    exact: true,
  })
  await initial.click()
  const input = page.getByRole('combobox')
  await input.fill('Marketing Site')
  await expect(page.getByRole('option')).toHaveCount(1)
  await page.getByRole('option', { name: 'Acme Inc / Marketing Site', exact: true }).click()
  await expect(input).toBeHidden()
  const selected = page.getByRole('button', {
    name: 'Switch project: Acme Inc / Marketing Site',
    exact: true,
  })
  await expect(selected).toBeVisible()
  await selected.click()
  await expect(
    page.getByRole('option', { name: 'Acme Inc / Marketing Site', exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('option', { name: 'Acme Inc / Technical Blog', exact: true }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(selected).toBeFocused()
})

test('no project matches shows an empty state and clearing restores candidates', async ({
  page,
}) => {
  await visit(page)
  const current = page.getByRole('button', {
    name: 'Switch project: Acme Inc / Technical Blog',
    exact: true,
  })
  await current.click()
  const input = page.getByRole('combobox')
  await input.fill('no-such-project-734021')
  await expect(page.getByText('No projects found.', { exact: true })).toBeVisible()
  await expect(page.getByRole('option')).toHaveCount(0)
  await input.clear()
  await expect(
    page.getByRole('option', { name: 'Acme Inc / Marketing Site', exact: true }),
  ).toBeVisible()
  await expect(page.getByText('No projects found.', { exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(current).toBeVisible()
})

test('empty-candidates fixture preserves the valid current project', async ({ page }) => {
  await visit(page, 'empty-candidates')
  const current = page.getByRole('button', {
    name: 'Switch project: Acme Inc / Technical Blog',
    exact: true,
  })
  await current.click()
  const input = page.getByRole('combobox')
  await expect(input).toBeFocused()
  await expect(page.getByText('No projects found.', { exact: true })).toBeVisible()
  await expect(page.getByRole('option')).toHaveCount(0)
  await input.fill('Marketing Site')
  await expect(page.getByRole('option')).toHaveCount(0)
  await input.clear()
  await expect(page.getByText('No projects found.', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(input).toBeHidden()
  await expect(current).toBeVisible()
  await expect(current).toBeFocused()
})

test('account menu presents the default identity and Escape restores its trigger', async ({
  page,
}) => {
  await visit(page)
  const trigger = page.getByRole('button', { name: 'Open account menu' })
  await trigger.click()
  const menu = page.getByRole('menu')
  await expect(menu.getByText('Shaban Haider', { exact: true })).toBeVisible()
  await expect(menu.getByText('shaban@efferd.com', { exact: true })).toBeVisible()
  for (const name of ['Account', 'Settings', 'Plan & Billing', 'Log out']) {
    await expect(menu.getByRole('menuitem', { name, exact: true })).toBeVisible()
  }
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(trigger).toBeFocused()
})
