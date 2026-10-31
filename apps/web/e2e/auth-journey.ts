import type { Locator, Page } from '@playwright/test'
import { expect } from './support'

const setupTitle = 'Create your super user account'
export const invalidLink = 'This link is invalid or has expired. Request a new link.'
export const supersededLink = 'A newer sign-in link was requested. Use the latest email.'
export const signInConfirmation =
  'If this account exists, a sign-in link is available in the development inbox.'

export async function expectPublicPage(page: Page) {
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Open account menu' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Search pages' })).toHaveCount(0)
}

export async function expectSetup(page: Page) {
  await expect(page.getByRole('heading', { name: setupTitle, exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/setup$/)
  await expectPublicPage(page)
  await expect(page.getByRole('link', { name: /sign in/i })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /sign in/i })).toHaveCount(0)
}

export async function expectSignIn(page: Page) {
  await expect(page).toHaveURL(/\/sign-in(?:\?.*)?$/)
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible()
  await expectPublicPage(page)
  await expect(page.getByRole('link', { name: /sign up|register|create.*account/i })).toHaveCount(0)
}

export async function submitSetup(page: Page, name: string, email: string) {
  await page.getByRole('textbox', { name: /name/i }).fill(name)
  await page.getByRole('textbox', { name: /email/i }).fill(email)
  await page.locator('form button[type="submit"]').click()
}

export async function expectFieldError(field: Locator) {
  await expect(field).toHaveAttribute('aria-invalid', 'true')
  await expect(field).toHaveAccessibleDescription(/\S/)
}

export async function expectInbox(page: Page) {
  await expect(page).toHaveURL(/\/development-inbox$/)
  await expect(page.getByRole('heading', { name: 'Development inbox', exact: true })).toBeVisible()
  await expect(
    page.getByText('Messages stay here; no email is sent', { exact: true }),
  ).toBeVisible()
}

export function message(page: Page, email: string, subject: string) {
  return page.getByRole('button').filter({ hasText: email }).filter({ hasText: subject })
}

export async function capturedLink(page: Page, email: string, subject: string, name?: string) {
  await message(page, email, subject).first().click()
  const readingPane = page.getByRole('region', { name: 'Reading pane', exact: true })
  await expect(readingPane.getByText('From', { exact: true })).toBeVisible()
  await expect(readingPane.getByText('To', { exact: true })).toBeVisible()
  await expect(readingPane.getByText('Subject', { exact: true })).toBeVisible()
  await expect(readingPane.getByText('Date', { exact: true })).toBeVisible()
  await expect(
    readingPane.getByText('Aircastle <no-reply@aircastle.test>', { exact: true }),
  ).toBeVisible()
  await expect(
    readingPane.getByText('This link expires in 5 minutes.', { exact: true }),
  ).toBeVisible()
  await expect(
    readingPane.getByText(
      subject === 'Create your Aircastle account'
        ? 'Confirm your email to create your account.'
        : 'Use this link to sign in.',
      { exact: true },
    ),
  ).toBeVisible()
  if (name) await expect(readingPane.getByText(name, { exact: false }).last()).toBeVisible()
  const link = readingPane.getByRole('link', { name: 'Continue', exact: true })
  await expect(link).toHaveCount(1)
  const href = await link.getAttribute('href')
  expect(href).toBeTruthy()
  const url = new URL(href!, page.url())
  expect(url.origin).toBe(new URL(page.url()).origin)
  return url.href
}

export async function signOut(page: Page, name: string, email: string) {
  await page.getByRole('button', { name: 'Open account menu', exact: true }).click()
  const menu = page.getByRole('menu')
  await expect(menu.getByText(name, { exact: true })).toBeVisible()
  await expect(menu.getByText(email, { exact: true })).toBeVisible()
  await menu.getByRole('menuitem', { name: 'Log out', exact: true }).click()
  await expectSignIn(page)
}

export async function expectBearerOutsideWebStorage(page: Page) {
  const cookies = (await page.context().cookies()).filter((cookie) => cookie.httpOnly)
  expect(cookies.length, 'Claim must issue an actual HttpOnly session cookie').toBeGreaterThan(0)
  const storage = await page.evaluate(() =>
    JSON.stringify({
      local: Object.entries(localStorage),
      session: Object.entries(sessionStorage),
      cookie: document.cookie,
    }),
  )
  for (const cookie of cookies) {
    const decoded = decodeURIComponent(cookie.value)
    for (const bearer of new Set([cookie.value, decoded, decoded.split('.')[0]!])) {
      expect(bearer, 'Issued bearer must be nonempty').not.toBe('')
      expect(storage, 'Issued session bearer must stay outside JavaScript storage').not.toContain(
        bearer,
      )
    }
  }
}
