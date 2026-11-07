import type { Page } from '@playwright/test'
import { test, expect, visit } from './support'
import { themeStorageKey } from '../src/theme'

test.use({ viewport: { width: 1440, height: 900 } })

async function toggleTheme(page: Page) {
  await page.getByRole('button', { name: 'Dark theme', exact: true }).click()
  await expect(page.getByRole('menu')).toHaveCount(0)
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

test('one click switches between dark and light, changing colors, storage and favicon, and survives reload', async ({
  page,
}) => {
  await visit(page)
  const toggle = page.getByRole('button', { name: 'Dark theme', exact: true })
  await expect(page.locator('html')).toHaveClass(/\bdark\b/)
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  const dark = await shellColors(page)
  expect(dark.background).not.toBe('rgba(0, 0, 0, 0)')

  await toggleTheme(page)
  await expectTheme(page, 'light', 'light')
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect.poll(async () => (await shellColors(page)).background).not.toBe(dark.background)
  await expect.poll(async () => (await shellColors(page)).foreground).not.toBe(dark.foreground)
  const light = await shellColors(page)
  await page.reload()
  await expectTheme(page, 'light', 'light')
  await expect.poll(() => shellColors(page)).toEqual(light)

  await toggleTheme(page)
  await expectTheme(page, 'dark', 'dark')
  await page.reload()
  await expectTheme(page, 'dark', 'dark')
  await expect.poll(() => shellColors(page)).toEqual(dark)
})

test('a first visit is dark even when the system prefers light', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await visit(page)
  await expect(page.locator('html')).toHaveClass(/\bdark\b/)
  await expect(page.getByRole('button', { name: 'Dark theme', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('a fresh context does not inherit the light choice', async ({ page, browser }) => {
  await visit(page)
  await toggleTheme(page)
  await expectTheme(page, 'light', 'light')
  const fresh = await browser.newContext({ colorScheme: 'light' })
  try {
    const other = await fresh.newPage()
    await visit(other)
    await expect(other.locator('html')).toHaveClass(/\bdark\b/)
    await expect
      .poll(() => other.evaluate((key) => localStorage.getItem(key), themeStorageKey))
      .not.toBe('light')
    await expectTheme(page, 'light', 'light')
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
