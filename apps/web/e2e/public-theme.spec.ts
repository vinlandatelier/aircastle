import type { Locator, Page } from '@playwright/test'
import { test, expect } from './support'
import { themeStorageKey } from '../src/theme'
import { origins } from './origins'

test.use({ baseURL: origins.fixture.url })

test.beforeEach(async ({ baseURL }, info) => {
  expect(baseURL).toBe(origins.fixture.url)
  info.annotations.push({
    type: 'scenario',
    description: 'display-only auth transport for public routing, metadata, and recovery',
  })
})

async function expectPaint(element: Locator, background: string, foreground?: string) {
  await expect
    .poll(() =>
      element.evaluate(
        (node, expected) => {
          const probe = document.createElement('span')
          probe.style.backgroundColor = expected.background
          if (expected.foreground) probe.style.color = expected.foreground
          document.body.append(probe)
          const actual = getComputedStyle(node)
          const reference = getComputedStyle(probe)
          const result = {
            background: actual.backgroundColor === reference.backgroundColor,
            foreground: !expected.foreground || actual.color === reference.color,
          }
          probe.remove()
          return result
        },
        { background, foreground },
      ),
    )
    .toEqual({ background: true, foreground: true })
}

async function expectPublic(page: Page, dark: boolean) {
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expectPaint(
    page.locator('body'),
    dark ? 'oklch(0.145 0 0)' : 'oklch(1 0 0)',
    dark ? 'oklch(0.985 0 0)' : 'oklch(0.145 0 0)',
  )
  const panel = page.locator('main > div').first()
  await expectPaint(panel, dark ? 'oklab(0.269 0 0 / 0.2)' : 'oklch(0.97 0 0)')
  await expect(panel).toHaveCSS(
    'border-right-color',
    dark ? 'oklch(1 0 0 / 0.1)' : 'oklch(0.922 0 0)',
  )
  const submit = page.getByRole('button', { name: 'Send sign-in link' })
  await expect(submit).toBeEnabled()
  await expectPaint(
    submit,
    dark ? 'oklch(0.922 0 0)' : 'oklch(0.205 0 0)',
    dark ? 'oklch(0.205 0 0)' : 'oklch(0.985 0 0)',
  )
  await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toBeFocused()
  await page.getByRole('textbox', { name: 'Email', exact: true }).blur()
  const inputGroup = page.locator('[data-slot="input-group"]')
  await expectPaint(inputGroup, dark ? 'oklab(1 0 0 / 0.045)' : 'rgba(0, 0, 0, 0)')
  await expect(inputGroup).toHaveCSS(
    'border-top-color',
    dark ? 'oklch(1 0 0 / 0.15)' : 'oklch(0.922 0 0)',
  )
  await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toHaveCSS(
    'color',
    dark ? 'oklch(0.985 0 0)' : 'oklch(0.145 0 0)',
  )
  await expect(page.getByText('Aircastle', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Sign in' })).toHaveCSS('font-weight', '600')
}

for (const theme of ['light', 'dark'] as const) {
  test(`public ${theme} palette matches Efferd and restores after dashboard navigation`, async ({
    page,
  }) => {
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
      key: themeStorageKey,
      value: theme,
    })
    await page.goto('/sign-in')
    await expectPublic(page, theme === 'dark')
    await page.getByRole('link', { name: 'Home', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Aircastle', exact: true })).toBeVisible()
    await page.goto('/dash')
    await expect(page.getByRole('button', { name: 'Choose theme' })).toBeVisible()
    const background = theme === 'dark' ? '#19191c' : '#ffffff'
    const foreground = theme === 'dark' ? 'oklch(0.97 0 none)' : 'oklch(0.269 0 none)'
    await expectPaint(page.locator('body'), background, foreground)
    await page.getByRole('button', { name: 'Choose theme' }).click()
    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()
    await expectPaint(menu, background, foreground)
    expect(await menu.evaluate((node) => node.closest('[data-theme-scope]') === null)).toBe(true)
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Search pages', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Search pages' })
    await expect(dialog).toBeVisible()
    await expectPaint(dialog, background, foreground)
    expect(await dialog.evaluate((node) => node.closest('[data-theme-scope]') === null)).toBe(true)
    await page.keyboard.press('Escape')
    await page.goBack()
    await expect(page.getByRole('heading', { name: 'Aircastle', exact: true })).toBeVisible()
    await page.goBack()
    await expectPublic(page, theme === 'dark')
    await page.goto('/dash')
    await expect(page.getByRole('button', { name: 'Choose theme' })).toBeVisible()
    await expectPaint(page.locator('body'), background, foreground)
  })
}
