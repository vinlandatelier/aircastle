import { randomUUID } from 'node:crypto'
import { test, expect } from './auth-service'
import {
  capturedLink,
  expectBearerOutsideWebStorage,
  expectFieldError,
  expectInbox,
  expectPublicPage,
  expectSetup,
  expectSignIn,
  invalidLink,
  message,
  signInConfirmation,
  signOut,
  submitSetup,
  supersededLink,
} from './auth-journey'

test.beforeEach(async ({ baseURL }, testInfo) => {
  expect(baseURL, 'Normal-build service origin is required').toBeTruthy()
  testInfo.annotations.push({
    type: 'lifecycle',
    description:
      'Each case owns a real API process, Postgres namespace, process-local inbox, and same-origin built browser. No initial-email restriction or injected browser session.',
  })
})

test('[auth:R1] [auth:R2] fresh local entry shows setup without the protected shell or sign-in', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Aircastle', exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/$/)
  for (const path of ['/sign-in', '/dash', '/dash/workspaces', '/setup']) {
    await page.goto(path)
    await expectSetup(page)
    await page.reload()
    await expectSetup(page)
  }
})

test('[auth:R2] [auth:R3] [auth:R4] [auth:R5] [auth:R6] [auth:R7] [auth:R8] real inbox setup, replacement, shared reads, safe mail, logout and existing sign-in', async ({
  page,
  browser,
}) => {
  test.slow()
  const email = `auth-${randomUUID()}@example.test`
  const name = 'Alex  <img src=x onerror="document.title=\'unsafe-auth-mail\'">'
  const subject = 'Create your Aircastle account'
  await page.goto('/dash')
  await expectSetup(page)

  for (const invalidName of ['   ', '😀'.repeat(121)]) {
    await submitSetup(page, invalidName, email)
    await expectFieldError(page.getByRole('textbox', { name: /name/i }))
    await expectSetup(page)
    await page.goto('/development-inbox')
    await expectInbox(page)
    await expect(page.getByText('No messages yet', { exact: true })).toBeVisible()
    await page.goto('/setup')
  }
  for (const invalidEmail of ['alex..demo@example.test', 'áléx@example.test']) {
    await submitSetup(page, name, invalidEmail)
    await expectFieldError(page.getByRole('textbox', { name: /email/i }))
    await expectSetup(page)
    await page.goto('/development-inbox')
    await expect(page.getByText('No messages yet', { exact: true })).toBeVisible()
    await page.goto('/setup')
  }

  await submitSetup(page, `  ${name}  `, `  ${email.toUpperCase()}  `)
  await expect(page.getByText('Check your development inbox', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Open development inbox', exact: true }).click()
  await expectInbox(page)
  await expect(page.getByText('Select a message', { exact: true })).toBeVisible()
  await expect(message(page, email, subject)).toHaveCount(1)
  const oldLink = await capturedLink(page, email, subject, name)
  await expect(page.locator('img[src="x"]')).toHaveCount(0)
  await expect(page).not.toHaveTitle('unsafe-auth-mail')
  await page.getByRole('link', { name: 'Continue', exact: true }).click()
  await expect(page.getByText(`Continue as ${email}`, { exact: true })).toBeVisible()
  await expectPublicPage(page)
  await page.goto('/dash')
  await expectSetup(page)

  const observer = await browser.newContext({ baseURL: new URL(page.url()).origin })
  const observerPage = await observer.newPage()
  const observerErrors: string[] = []
  const observerHttpErrors: { method: string; url: string; status: number }[] = []
  const previewUrl = new URL('/api/auth/confirm/preview', page.url()).href
  observerPage.on('pageerror', (error) => observerErrors.push(error.message))
  observerPage.on('console', (entry) => {
    if (
      entry.type() === 'error' &&
      !(
        entry.location().url === previewUrl &&
        entry.text() ===
          'Failed to load resource: the server responded with a status of 400 (Bad Request)'
      )
    )
      observerErrors.push(entry.text())
  })
  observerPage.on('response', (response) => {
    if (response.status() >= 400)
      observerHttpErrors.push({
        method: response.request().method(),
        url: response.url(),
        status: response.status(),
      })
  })
  try {
    await observerPage.goto('/development-inbox')
    await expectInbox(observerPage)
    await expect(message(observerPage, email, subject)).toHaveCount(1)
    await submitSetup(page, `  ${name}  `, email)
    await expect(page.getByText('Check your development inbox', { exact: true })).toBeVisible()
    await expect(message(observerPage, email, subject)).toHaveCount(2)
    const newest = message(observerPage, email, subject).first()
    await expect(newest).toHaveAccessibleName(/unread/i)
    await page.getByRole('link', { name: 'Open development inbox', exact: true }).click()
    const latestLink = await capturedLink(page, email, subject, name)
    expect(latestLink).not.toBe(oldLink)
    await expect(newest).toHaveAccessibleName(/\bread\b/i)
    await expect(newest).not.toHaveAccessibleName(/unread/i)
    await expect(observerPage.getByText('Select a message', { exact: true })).toBeVisible()

    await observerPage.goto(oldLink)
    await expect(observerPage.getByText(supersededLink, { exact: true })).toBeVisible()
    await expectPublicPage(observerPage)
    await observerPage.goto('/dash')
    await expectSetup(observerPage)
    await observerPage.goto(latestLink)
    await expect(observerPage.getByText(`Continue as ${email}`, { exact: true })).toBeVisible()
    await expectPublicPage(observerPage)
    await page.goto('/dash')
    await expectSetup(page)
    await observerPage.getByRole('button', { name: 'Continue', exact: true }).click()
    await expect(observerPage).toHaveURL(/\/dash\/workspaces\/new$/)
    await expectBearerOutsideWebStorage(observerPage)
    await expect(
      observerPage.getByRole('heading', { name: 'Create a workspace', exact: true }),
    ).toBeVisible()
    await expect(observerPage.getByRole('textbox')).toHaveCount(0)
    await expect(observerPage.locator('form')).toHaveCount(0)
    await observerPage.getByRole('button', { name: 'Skip', exact: true }).click()
    await expect(observerPage).toHaveURL(/\/dash\/workspaces$/)
    await expect(
      observerPage.getByRole('heading', { name: 'Workspaces', exact: true }),
    ).toBeVisible()
    await expect(
      observerPage.getByRole('link', { name: 'Create workspace', exact: true }),
    ).toHaveAttribute('href', '/dash/workspaces/new')
    await observerPage.reload()
    await expect(
      observerPage.getByRole('heading', { name: 'Workspaces', exact: true }),
    ).toBeVisible()
    await signOut(observerPage, name, email)
    await observerPage.goto(latestLink)
    await expect(observerPage.getByText(invalidLink, { exact: true })).toBeVisible()
    await expectPublicPage(observerPage)
    await observerPage.goto('/dash')
    await expectSignIn(observerPage)
    expect(observerHttpErrors, 'Only the superseded and used links must be rejected').toEqual([
      { method: 'POST', url: previewUrl, status: 400 },
      { method: 'POST', url: previewUrl, status: 400 },
    ])
    expect(observerErrors, 'Independent browser must have no runtime or console errors').toEqual([])
  } finally {
    await observer.close()
  }

  await page.goto('/setup')
  await expectSignIn(page)
  const emailField = page.getByRole('textbox', { name: /email/i })
  await emailField.fill(`unknown-${randomUUID()}@example.test`)
  await page.getByRole('button', { name: 'Send sign-in link', exact: true }).click()
  await expect(page.getByText(signInConfirmation, { exact: true })).toBeVisible()
  await page.goto('/development-inbox')
  await expect(page.getByRole('button').filter({ hasText: 'Sign in to Aircastle' })).toHaveCount(0)
  await page.goto('/sign-in')
  await emailField.fill(` ${email.toUpperCase()} `)
  await page.getByRole('button', { name: 'Send sign-in link', exact: true }).click()
  await expect(page.getByText(signInConfirmation, { exact: true })).toBeVisible()
  await page.goto('/development-inbox')
  await expect(message(page, email, 'Sign in to Aircastle')).toHaveCount(1)
  await capturedLink(page, email, 'Sign in to Aircastle')
  await page.getByRole('link', { name: 'Continue', exact: true }).click()
  await expect(page.getByText(`Continue as ${email}`, { exact: true })).toBeVisible()
  await expectPublicPage(page)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page).toHaveURL(/\/dash\/workspaces$/)
  await expectBearerOutsideWebStorage(page)
  await expect(page.getByRole('heading', { name: 'Workspaces', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Workspaces', exact: true })).toBeVisible()
  await signOut(page, name, email)
})
