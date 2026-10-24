import type { Locator, Page } from '@playwright/test'
import { test, expect, visit, assertLayout, visibleSidebarTrigger } from './support'

const destinations = [
  ['Tasks', '/dash/workspaces/demo/projects/demo/tasks'],
  ['Collections', '/dash/workspaces/demo/projects/demo/collections'],
  ['Media Library', '/dash/workspaces/demo/projects/demo/media'],
  ['Analytics', '/dash/workspaces/demo/projects/demo/analytics'],
  ['Users', '/dash/workspaces/demo/projects/demo/users'],
  ['Access Tokens', '/dash/workspaces/demo/projects/demo/access-tokens'],
  ['Settings', '/dash/workspaces/demo/projects/demo/settings'],
] as const

async function expectDestination(page: Page, name: string, path: string) {
  await expect(page).toHaveURL(new RegExp(`${path}$`))
  const navigation = page.getByRole('navigation', { name: 'Main navigation' })
  await expect(navigation.getByRole('link', { name, exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await expect(navigation.locator('a[aria-current="page"]')).toHaveCount(1)
}

async function expectFocusInside(page: Page, dialog: Locator) {
  await expect
    .poll(() => dialog.evaluate((element) => element.contains(document.activeElement)))
    .toBe(true)
  await expect(page.locator(':focus')).toBeVisible()
}

test.describe('routes and history', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('all seven default destinations have independent titles, paths and active state', async ({
    page,
  }) => {
    await visit(page)
    const navigation = page.getByRole('navigation', { name: 'Main navigation' })
    await expect(navigation.getByRole('link')).toHaveCount(7)
    for (const [name, path] of destinations) {
      await expect(navigation.getByRole('link', { name, exact: true })).toHaveAttribute(
        'href',
        path,
      )
      await navigation.getByRole('link', { name, exact: true }).click()
      await expectDestination(page, name, path)
    }
    await expect(page.getByRole('link', { name: 'Docs', exact: true })).toHaveAttribute(
      'href',
      '/api/docs',
    )
    await expect(page.getByRole('link', { name: 'GitHub', exact: true })).toHaveAttribute(
      'href',
      'https://github.com/vinlandatelier/aircastle',
    )
  })

  test('Back and Forward follow visible navigation and the brand returns to Collections', async ({
    page,
  }) => {
    await visit(page, 'normal', '/dash/workspaces/acme/projects/editorial/settings')
    await page.reload()
    await expectDestination(page, 'Settings', '/dash/workspaces/acme/projects/editorial/settings')
    const navigation = page.getByRole('navigation', { name: 'Main navigation' })
    await navigation.getByRole('link', { name: 'Tasks', exact: true }).click()
    await expectDestination(page, 'Tasks', '/dash/workspaces/acme/projects/editorial/tasks')
    await navigation.getByRole('link', { name: 'Media Library', exact: true }).click()
    await expectDestination(page, 'Media Library', '/dash/workspaces/acme/projects/editorial/media')
    await page.goBack()
    await expectDestination(page, 'Tasks', '/dash/workspaces/acme/projects/editorial/tasks')
    await page.goForward()
    await expectDestination(page, 'Media Library', '/dash/workspaces/acme/projects/editorial/media')
    await page.getByRole('banner').getByRole('link', { name: 'Aircastle' }).click()
    await expectDestination(
      page,
      'Collections',
      '/dash/workspaces/acme/projects/editorial/collections',
    )
  })
})

test('desktop collapse changes rendered width and survives client navigation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await visit(page)
  const trigger = visibleSidebarTrigger(page)
  const navigation = page.getByRole('navigation', { name: 'Main navigation' })
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  const expandedWidth = await navigation.evaluate(
    (element) => element.getBoundingClientRect().width,
  )
  await trigger.click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await expect
    .poll(() => navigation.evaluate((element) => element.getBoundingClientRect().width))
    .toBeLessThan(expandedWidth)
  for (const [name, path] of destinations) {
    const link = navigation.getByRole('link', { name, exact: true })
    await expect(link).toBeVisible()
    await link.click()
    await expectDestination(page, name, path)
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  }
  await trigger.click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await expect
    .poll(() => navigation.evaluate((element) => element.getBoundingClientRect().width))
    .toBeCloseTo(expandedWidth, 0)
})

test.describe('mobile drawer', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('keyboard focus stays inside and Escape or backdrop restores the visible trigger', async ({
    page,
  }) => {
    await visit(page)
    const trigger = visibleSidebarTrigger(page)
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    for (const dismissal of ['Escape', 'backdrop']) {
      await trigger.focus()
      await page.keyboard.press('Enter')
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await expect(trigger).toHaveAttribute('aria-expanded', 'true')
      for (const [name, path] of destinations) {
        await expect(dialog.getByRole('link', { name, exact: true })).toHaveAttribute('href', path)
      }
      await expectFocusInside(page, dialog)
      for (const key of ['Tab', 'Shift+Tab']) {
        for (let step = 0; step < 10; step++) {
          await page.keyboard.press(key)
          await expectFocusInside(page, dialog)
        }
      }
      if (dismissal === 'Escape') await page.keyboard.press('Escape')
      else await page.mouse.click(382, 836)
      await expect(dialog).toBeHidden()
      await expect(trigger).toHaveAttribute('aria-expanded', 'false')
      await expect(trigger).toBeFocused()
      await expect(trigger).toBeVisible()
    }
  })

  for (const selection of ['pointer', 'keyboard']) {
    test(`selecting a destination by ${selection} closes the drawer and restores trigger focus`, async ({
      page,
    }) => {
      await visit(page)
      const trigger = visibleSidebarTrigger(page)
      await trigger.click()
      const destination = page.getByRole('dialog').getByRole('link', { name: 'Tasks', exact: true })
      if (selection === 'keyboard') {
        await destination.focus()
        await page.keyboard.press('Enter')
      } else await destination.click()
      await expect(page).toHaveURL(/\/dash\/workspaces\/demo\/projects\/demo\/tasks$/)
      await expect(page.getByRole('dialog')).toBeHidden()
      await expect(trigger).toHaveAttribute('aria-expanded', 'false')
      await expect(trigger).toBeFocused()
      await trigger.click()
      await expectDestination(page, 'Tasks', '/dash/workspaces/demo/projects/demo/tasks')
      await page.keyboard.press('Escape')
    })
  }
})

test('desktop collapse and mobile drawer state remain independent across resizing', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await visit(page)
  await visibleSidebarTrigger(page).click()
  await expect(visibleSidebarTrigger(page)).toHaveAttribute('aria-expanded', 'false')
  for (const width of [390, 767]) {
    await page.setViewportSize({ width, height: 844 })
    const mobile = visibleSidebarTrigger(page)
    await expect(mobile).toHaveAttribute('aria-expanded', 'false')
    await mobile.click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(mobile).toBeFocused()
    await page.setViewportSize({ width: 768, height: 900 })
    const desktop = visibleSidebarTrigger(page)
    await expect(desktop).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await desktop.click()
    await expect(desktop).toHaveAttribute('aria-expanded', 'true')
    await desktop.click()
    await expect(desktop).toHaveAttribute('aria-expanded', 'false')
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(visibleSidebarTrigger(page)).toHaveAttribute('aria-expanded', 'false')
})

test.describe('page search', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  for (const selection of ['keyboard', 'pointer']) {
    test(`button search filters Users and navigates by ${selection}`, async ({ page }) => {
      await visit(page)
      const button = page.getByRole('button', { name: 'Search pages', exact: true })
      await button.click()
      const dialog = page.getByRole('dialog', { name: 'Search pages' })
      const input = dialog.getByRole('combobox')
      await expect(input).toBeFocused()
      await input.fill('Users')
      await expect(dialog.getByRole('option')).toHaveCount(1)
      await expect(dialog.getByRole('option', { name: 'Users', exact: true })).toBeVisible()
      if (selection === 'keyboard') {
        await page.keyboard.press('ArrowDown')
        await page.keyboard.press('Enter')
      } else await dialog.getByRole('option', { name: 'Users', exact: true }).click()
      await expectDestination(page, 'Users', '/dash/workspaces/demo/projects/demo/users')
      await expect(dialog).toBeHidden()
      await expect(button).toBeFocused()
    })
  }

  for (const shortcut of ['Control+k', 'Meta+k']) {
    for (const dismissal of ['Escape', 'backdrop']) {
      test(`${shortcut} focuses search and ${dismissal} restores the previously focused control`, async ({
        page,
      }) => {
        await visit(page)
        const previous = page.getByRole('button', { name: 'Choose theme' })
        await previous.focus()
        await page.keyboard.press(shortcut)
        const dialog = page.getByRole('dialog', { name: 'Search pages' })
        await expect(dialog.getByRole('combobox')).toBeFocused()
        if (dismissal === 'Escape') await page.keyboard.press('Escape')
        else await page.mouse.click(1432, 892)
        await expect(dialog).toBeHidden()
        await expect(previous).toBeFocused()
        await expect(previous).toBeVisible()
      })
    }
  }

  test('empty and 1000-character queries remain editable, clearable and contained', async ({
    page,
  }) => {
    await visit(page)
    await page.getByRole('button', { name: 'Search pages', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Search pages' })
    const input = dialog.getByRole('combobox')
    for (const query of ['no-such-page-734021', 'W'.repeat(1000)]) {
      await input.fill(query)
      await expect(input).toHaveValue(query)
      await expect(dialog.getByText('No pages found.', { exact: true })).toBeVisible()
      await expect(dialog.getByRole('option')).toHaveCount(0)
      await assertLayout(page)
      await input.press('End')
      await input.press('Backspace')
      await expect(input).toHaveValue(query.slice(0, -1))
      await input.clear()
      await expect(dialog.getByRole('option')).toHaveCount(7)
      await expect(dialog.getByText('No pages found.', { exact: true })).toHaveCount(0)
    }
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Search pages', exact: true })).toBeFocused()
  })

  test('Tab is trapped and backdrop dismissal restores the search button', async ({ page }) => {
    await visit(page)
    const button = page.getByRole('button', { name: 'Search pages', exact: true })
    await button.click()
    const dialog = page.getByRole('dialog', { name: 'Search pages' })
    for (const key of ['Tab', 'Shift+Tab']) {
      for (let step = 0; step < 10; step++) {
        await page.keyboard.press(key)
        await expectFocusInside(page, dialog)
      }
    }
    await page.mouse.click(1432, 892)
    await expect(dialog).toBeHidden()
    await expect(button).toBeFocused()
    await expect(button).toBeVisible()
  })
})
