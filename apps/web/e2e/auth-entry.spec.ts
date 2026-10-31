import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { test, expect } from './auth-service'
import {
  capturedLink,
  expectBearerOutsideWebStorage,
  expectPublicPage,
  expectSetup,
  expectSignIn,
  signInConfirmation,
  signOut,
  submitSetup,
} from './auth-journey'

async function confirmSetup(page: Page, email: string) {
  await page.goto('/setup')
  await expectSetup(page)
  await submitSetup(page, 'Alex', email)
  await page.getByRole('link', { name: 'Open development inbox', exact: true }).click()
  const link = await capturedLink(page, email, 'Create your Aircastle account')
  const response = await page.goto(link)
  expect(response?.headers()['referrer-policy']).toBe('no-referrer')
  await expect(page.getByText(`Continue as ${email}`, { exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/setup$/)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page).toHaveURL(/\/dash\/workspaces\/new$/)
}

async function signIn(page: Page, email: string) {
  await page.goto('/sign-in')
  await expectSignIn(page)
  await page.getByRole('textbox', { name: /email/i }).fill(email)
  await page.getByRole('button', { name: 'Send sign-in link', exact: true }).click()
  await page.getByRole('link', { name: 'Open development inbox', exact: true }).click()
  await capturedLink(page, email, 'Sign in to Aircastle')
  await page.getByRole('link', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
}

for (const leave of ['close', 'URL'] as const) {
  test(`[auth:R4] ${leave} departure persists onboarding skip across a new sign-in`, async ({
    page,
  }) => {
    const email = `entry-${randomUUID()}@example.test`
    await confirmSetup(page, email)
    if (leave === 'close') await page.getByRole('button', { name: /close/i }).click()
    else await page.goto('/dash/workspaces')
    await expect(page).toHaveURL(/\/dash\/workspaces$/)
    await expect(page.getByRole('heading', { name: 'Workspaces', exact: true })).toBeVisible()
    await signOut(page, 'Alex', email)
    await signIn(page, email)
    await expect(page).toHaveURL(/\/dash\/workspaces$/)
    await expect(page.getByRole('heading', { name: 'Workspaces', exact: true })).toBeVisible()
    await page.goto('/dash/workspaces/new')
    await expect(
      page.getByRole('heading', { name: 'Create a workspace', exact: true }),
    ).toBeVisible()
  })
}

test('[auth:R7] revoked session disappears on the next navigation without a shell flash', async ({
  page,
}) => {
  const email = `revoke-${randomUUID()}@example.test`
  await confirmSetup(page, email)
  const revoked = await page.request.post('/api/auth/sign-out', {
    data: {},
    headers: { origin: new URL(page.url()).origin },
  })
  expect(revoked.status()).toBe(200)
  await page.goto('/dash/workspaces')
  await expectSignIn(page)
  await expectPublicPage(page)
})

test('[auth:R9] email throttling shows the approved countdown without another message', async ({
  page,
}) => {
  await page.goto('/setup')
  await expectSetup(page)
  const email = `limited-${randomUUID()}@example.test`
  for (let index = 0; index < 5; index++) {
    const response = await page.request.post('/api/auth/setup', {
      data: { name: 'Alex', email },
      headers: { origin: new URL(page.url()).origin },
    })
    expect(response.status()).toBe(200)
  }
  await submitSetup(page, 'Alex', email)
  await expect(page.getByText(/^Too many requests\. Try again in .+\.$/)).toBeVisible()
  await page.goto('/development-inbox')
  await expect(page.getByRole('button').filter({ hasText: email })).toHaveCount(5)
})

for (const access of ['retained', 'revoked before confirmation'] as const) {
  test(`[auth:R4] [auth:R5] [auth:R6] [auth:R7] real sign-in rechecks ${access} access before restoring a requested project`, async ({
    page,
    authService,
  }) => {
    test.setTimeout(60_000)
    const project = await authService.provisionProject()
    const email = `return-${randomUUID()}@example.test`
    await confirmSetup(page, email)
    await expectBearerOutsideWebStorage(page)
    await page.getByRole('button', { name: 'Skip', exact: true }).click()
    await expect(page).toHaveURL(/\/dash\/workspaces$/)
    await expect(page.getByRole('heading', { name: 'Workspaces', exact: true })).toBeVisible()
    await authService.grantWorkspace(email, project.workspaceId)
    await signOut(page, 'Alex', email)

    const requested = `/dash/workspaces/${project.workspaceId}/projects/${project.projectId}/collections`
    const origin = new URL(page.url()).origin
    await page.goto(`${requested}?callbackURL=https%3A%2F%2Fevil.test&redirect=%2F%2Fevil.test`)
    await expectSignIn(page)
    const sent = page.waitForRequest(
      (request) =>
        request.method() === 'POST' && new URL(request.url()).pathname === '/api/auth/sign-in',
    )
    await page.getByRole('textbox', { name: 'Email' }).fill(email)
    await page.getByRole('button', { name: 'Send sign-in link', exact: true }).click()
    expect((await sent).postDataJSON()).toEqual({
      email,
      returnTo: { kind: 'project-page', ...project, page: 'collections' },
    })
    await expect(page.getByText(signInConfirmation, { exact: true })).toBeVisible()
    if (access === 'revoked before confirmation')
      await authService.revokeWorkspace(email, project.workspaceId)
    await page.getByRole('link', { name: 'Open development inbox', exact: true }).click()
    await capturedLink(page, email, 'Sign in to Aircastle')
    await page.getByRole('link', { name: 'Continue', exact: true }).click()
    await expect(page.getByText(`Continue as ${email}`, { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Continue', exact: true }).click()

    const destination = access === 'retained' ? requested : '/dash/workspaces'
    await expect(page).toHaveURL(`${origin}${destination}`)
    await expectBearerOutsideWebStorage(page)
    await page.reload()
    await expect(page).toHaveURL(`${origin}${destination}`)
    if (access === 'retained') {
      await expect(
        page
          .getByRole('navigation', { name: 'Main navigation' })
          .getByRole('link', { name: 'Collections', exact: true }),
      ).toHaveAttribute('aria-current', 'page')
      await authService.revokeWorkspace(email, project.workspaceId)
    }
    await page.goto('/dash')
    await expect(page).toHaveURL(`${origin}/dash/workspaces`)
    await expect(page.getByRole('heading', { name: 'Workspaces', exact: true })).toBeVisible()
    await signOut(page, 'Alex', email)
    await signIn(page, email)
    await expect(page).toHaveURL(`${origin}/dash/workspaces`)
    await expect(
      page.getByRole('heading', { name: 'Create a workspace', exact: true }),
    ).toHaveCount(0)
  })
}
