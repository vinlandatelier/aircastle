import { test, expect, visit, assertLayout, visibleSidebarTrigger } from './support'

for (const scenario of ['normal', 'long-text'] as const) {
  test(`T8 R3 R4 R5 R6 R7 R8 ${scenario}: mobile project and Dark survive drawer and search navigation, route and theme survive reload`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await visit(page, scenario)
    const longName = 'W'.repeat(1000)
    const identity =
      scenario === 'normal' ? 'Acme Inc / Marketing Site' : `${longName} / ${longName}`
    const project = page.getByRole('button', { name: /^Switch project:/ })
    await project.click()
    const projectInput = page.getByRole('combobox')
    await projectInput.fill(scenario === 'normal' ? 'Marketing Site' : longName)
    await page.getByRole('option', { name: identity, exact: true }).click()
    await expect(projectInput).toBeHidden()
    await expect(project).toHaveAccessibleName(`Switch project: ${identity}`)
    await assertLayout(page)

    const header = page.getByRole('banner')
    await page.getByRole('button', { name: 'Choose theme', exact: true }).click()
    await page.getByRole('menuitemradio', { name: 'Light', exact: true }).click()
    await expect(page.locator('html')).toHaveClass(/\blight\b/)
    const lightColors = await header.evaluate((element) => ({
      background: getComputedStyle(element).backgroundColor,
      foreground: getComputedStyle(element).color,
    }))
    await page.getByRole('button', { name: 'Choose theme', exact: true }).click()
    await page.getByRole('menuitemradio', { name: 'Dark', exact: true }).click()
    await expect(page.getByRole('menu', { name: 'Theme', exact: true })).toBeHidden()
    await expect(page.locator('html')).toHaveClass(/\bdark\b/)
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('aircastle-theme')))
      .toBe('dark')
    await expect
      .poll(() => header.evaluate((element) => getComputedStyle(element).backgroundColor))
      .not.toBe(lightColors.background)
    await expect
      .poll(() => header.evaluate((element) => getComputedStyle(element).color))
      .not.toBe(lightColors.foreground)
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
      'href',
      '/brand/favicon-dark.svg',
    )

    const trigger = visibleSidebarTrigger(page)
    await trigger.click()
    const drawer = page.getByRole('dialog')
    const tasks = drawer.getByRole('link', { name: 'Tasks', exact: true })
    await expect(tasks).toHaveAttribute('href', '/tasks')
    await tasks.click()
    await expect(page).toHaveURL(/\/tasks(?:\?.*)?$/)
    await expect(drawer).toBeHidden()
    await expect(trigger).toBeVisible()
    await expect(trigger).toBeFocused()
    await expect(project).toHaveAccessibleName(`Switch project: ${identity}`)
    await expect(page.locator('html')).toHaveClass(/\bdark\b/)
    await trigger.click()
    await expect(
      page.getByRole('dialog').getByRole('link', { name: 'Tasks', exact: true }),
    ).toHaveAttribute('data-active', 'true')
    await page.keyboard.press('Escape')
    await expect(trigger).toBeFocused()
    await assertLayout(page)
    await testInfo.attach('after-drawer-navigation', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })

    await page.getByRole('button', { name: 'Search pages', exact: true }).click()
    const search = page.getByRole('dialog', { name: 'Search pages', exact: true })
    const query = search.getByRole('combobox')
    await expect(query).toBeFocused()
    await query.fill('Users')
    await expect(search.getByRole('option', { name: 'Users', exact: true })).toBeVisible()
    await query.press('ArrowDown')
    await query.press('Enter')
    await expect(page).toHaveURL(/\/users(?:\?.*)?$/)
    await expect(search).toBeHidden()
    await expect(page.getByRole('button', { name: 'Search pages', exact: true })).toBeFocused()
    await expect(project).toHaveAccessibleName(`Switch project: ${identity}`)
    await expect(page.locator('html')).toHaveClass(/\bdark\b/)
    await assertLayout(page)

    await trigger.click()
    await expect(
      page.getByRole('dialog').getByRole('link', { name: 'Users', exact: true }),
    ).toHaveAttribute('data-active', 'true')
    await page.keyboard.press('Escape')
    await expect(trigger).toBeFocused()
    await page.reload()
    await expect(page).toHaveURL(/\/users(?:\?.*)?$/)
    await expect(page.locator('html')).toHaveClass(/\bdark\b/)
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('aircastle-theme')))
      .toBe('dark')
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
      'href',
      '/brand/favicon-dark.svg',
    )
    await page.getByRole('button', { name: 'Choose theme', exact: true }).click()
    await expect(page.getByRole('menuitemradio', { name: 'Dark', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await page.keyboard.press('Escape')
    await trigger.click()
    await expect(
      page.getByRole('dialog').getByRole('link', { name: 'Users', exact: true }),
    ).toHaveAttribute('data-active', 'true')
    await page.keyboard.press('Escape')
    await assertLayout(page)
    await testInfo.attach('after-reload', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
  })
}

test.afterEach(async ({ page }, testInfo) => {
  if (!page.isClosed() && testInfo.status !== testInfo.expectedStatus) {
    await testInfo.attach('integration-failure', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
  }
})
