import { randomUUID } from 'node:crypto'
import { test, expect } from './auth-service'
import {
  capturedLink,
  expectInbox,
  expectPublicPage,
  expectSetup,
  invalidLink,
  submitSetup,
} from './auth-journey'

test('[auth:R5] malformed completion removes the token and sets no-referrer', async ({ page }) => {
  const token = 'invalid-token-should-disappear'
  const response = await page.goto(`/setup?token=${token}`)
  expect(response?.headers()['referrer-policy']).toBe('no-referrer')
  await expect(page.getByText(invalidLink, { exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/setup$/)
  expect(await page.evaluate(() => document.referrer)).not.toContain(token)
  await expectPublicPage(page)
  await page.getByRole('link', { name: /setup|create.*account/i }).click()
  await expectSetup(page)
})

test('[auth:R7] initial session check never flashes the protected shell', async ({ page }) => {
  let release!: () => void
  let requested = false
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.addInitScript(() => {
    const flashes: string[] = []
    Object.assign(window, { authShellFlashes: flashes })
    const inspect = () => {
      if (
        document.querySelector(
          '[data-theme-scope="dashboard"], [aria-label="Open account menu"], [aria-label="Main navigation"]',
        )
      )
        flashes.push(location.pathname)
    }
    new MutationObserver(inspect).observe(document, {
      childList: true,
      subtree: true,
      attributes: true,
    })
  })
  await page.route('**/api/auth/{state,session}', async (route) => {
    requested = true
    await held
    await route.continue()
  })
  try {
    await page.goto('/dash/workspaces')
    await expect
      .poll(() => requested, {
        message: 'The browser must request real authentication state before admitting the shell',
      })
      .toBe(true)
    await expectPublicPage(page)
  } finally {
    release()
  }
  await expectSetup(page)
  expect(await page.evaluate(() => Reflect.get(window, 'authShellFlashes'))).toEqual([])
})

test('[auth:R8] failed inbox load offers Retry and recovers against the real API', async ({
  page,
}) => {
  await page.route('**/api/development-inbox/messages', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ kind: 'temporary-failure' }),
    }),
  )
  await page.goto('/development-inbox')
  await expect(page.getByText('Could not load messages. Try again.', { exact: true })).toBeVisible()
  await page.unroute('**/api/development-inbox/messages')
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.getByText('No messages yet', { exact: true })).toBeVisible()
})

test('[auth:R3] failed setup request reports retryable failure without claiming delivery', async ({
  page,
}) => {
  await page.goto('/setup')
  await expectSetup(page)
  await page.route('**/api/auth/setup', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ kind: 'temporary-failure' }),
    }),
  )
  await submitSetup(page, 'Alex', 'alex@example.test')
  await expect(
    page.getByText('Could not create your sign-in email. Try again.', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText('Check your development inbox', { exact: true })).toHaveCount(0)
  await page.goto('/development-inbox')
  await expect(page.getByText('No messages yet', { exact: true })).toBeVisible()
})

test('[auth:R5] expired real setup link has the generic token-free error', async ({
  page,
  authService,
}) => {
  const email = `expired-${randomUUID()}@example.test`
  await page.goto('/setup')
  await expectSetup(page)
  await submitSetup(page, 'Alex', email)
  await page.getByRole('link', { name: 'Open development inbox', exact: true }).click()
  const link = await capturedLink(page, email, 'Create your Aircastle account')
  await authService.advance(300_000)
  await page.goto(link)
  await expect(page.getByText(invalidLink, { exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/setup$/)
  await expectPublicPage(page)
})

test('[auth:R8] hostile display name stays text in the actual captured email', async ({ page }) => {
  const name = '<img src=x onerror="document.title=\'unsafe-mail\'">'
  const email = `hostile-${randomUUID()}@example.test`
  await page.goto('/setup')
  await expectSetup(page)
  await submitSetup(page, name, email)
  await page.getByRole('link', { name: 'Open development inbox', exact: true }).click()
  await expectInbox(page)
  await capturedLink(page, email, 'Create your Aircastle account', name)
  await expect(page.locator('img[src="x"], script[src="x"]')).toHaveCount(0)
  for (const frame of page.frames()) {
    await expect(frame.locator('img[src="x"]')).toHaveCount(0)
    expect(await frame.evaluate(() => document.title)).not.toBe('unsafe-mail')
  }
  await expect(page).toHaveURL(/\/development-inbox$/)
})

test.describe('initial email restriction', () => {
  test.use({ authEnvironment: { AIRCASTLE_INITIAL_SUPER_USER_EMAIL: 'allowed@example.test' } })
  test('[auth:R2] rejected identity shows the approved field error and captures no message', async ({
    page,
  }) => {
    await page.goto('/setup')
    await expectSetup(page)
    await submitSetup(page, 'Alex', 'other@example.test')
    await expect(
      page.getByText('This email is not allowed for initial setup', { exact: true }),
    ).toBeVisible()
    await page.goto('/development-inbox')
    await expect(page.getByText('No messages yet', { exact: true })).toBeVisible()
  })
})

test('[auth:R4] a losing valid setup link shows completed setup instead of authenticating', async ({
  page,
  browser,
}) => {
  const winner = `winner-${randomUUID()}@example.test`
  const loser = `loser-${randomUUID()}@example.test`
  const links: string[] = []
  for (const email of [winner, loser]) {
    await page.goto('/setup')
    await expectSetup(page)
    await submitSetup(page, 'Alex', email)
    await page.getByRole('link', { name: 'Open development inbox', exact: true }).click()
    links.push(await capturedLink(page, email, 'Create your Aircastle account'))
  }
  await page.goto(links[0]!)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page).toHaveURL(/\/dash\/workspaces\/new$/)
  const observer = await browser.newContext({ baseURL: new URL(page.url()).origin })
  try {
    const signedOut = await observer.newPage()
    await signedOut.goto(links[1]!)
    await expect(
      signedOut.getByText('Setup is complete. Sign in to continue', { exact: true }),
    ).toBeVisible()
    await expect(signedOut).toHaveURL(/\/setup$/)
    await expectPublicPage(signedOut)
    await signedOut.goto('/dash')
    await expect(signedOut.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible()
  } finally {
    await observer.close()
  }
})
