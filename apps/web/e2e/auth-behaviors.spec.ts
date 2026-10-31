import { randomUUID } from 'node:crypto'
import type { Browser, Locator, Page, Route } from '@playwright/test'
import { test, expect } from './auth-service'
import {
  capturedLink,
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

const setupSubject = 'Create your Aircastle account'
const signInSubject = 'Sign in to Aircastle'
const setupComplete = 'Setup is complete. Sign in to continue'
const requestFailed = 'Could not create your sign-in email. Try again.'
const disabled =
  'Local authentication is not enabled. For local development, set AIRCASTLE_ENV=development.'
const throttled = /^Too many requests\. Try again in (\d+) seconds?\.$/
const fixtureHttpErrors = [
  '/api/auth/confirm/preview',
  '/api/auth/confirm',
  '/api/auth/setup',
  '/api/auth/sign-in',
  '/api/auth/session',
  '/api/auth/activity',
  '/api/development-inbox/messages',
]
const fourteenDays = 1_209_600_000

function uniqueEmail(label: string) {
  return `${label}-${randomUUID()}@example.test`
}

function origin(page: Page) {
  return new URL(page.url()).origin
}

function heading(page: Page, name: string) {
  return page.getByRole('heading', { name, exact: true })
}

async function requestSetupLink(page: Page, email: string, name = 'Alex') {
  await page.goto('/setup')
  await expectSetup(page)
  await submitSetup(page, name, email)
  await expect(page.getByText('Check your development inbox', { exact: true })).toBeVisible()
  await page.goto('/development-inbox')
  await expectInbox(page)
  return capturedLink(page, email, setupSubject)
}

async function requestSignInLink(page: Page, email: string) {
  await page.goto('/sign-in')
  await expectSignIn(page)
  await page.getByRole('textbox', { name: 'Email' }).fill(email)
  await page.getByRole('button', { name: 'Send sign-in link', exact: true }).click()
  await expect(page.getByText(signInConfirmation, { exact: true })).toBeVisible()
  await page.goto('/development-inbox')
  await expectInbox(page)
  return capturedLink(page, email, signInSubject)
}

async function confirmLink(page: Page, link: string, email: string) {
  await page.goto(link)
  await expect(page.getByText(`Continue as ${email}`, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
}

async function completeSetup(page: Page, email: string, name = 'Alex') {
  await confirmLink(page, await requestSetupLink(page, email, name), email)
  await expect(page).toHaveURL(/\/dash\/workspaces\/new$/)
  await expect(heading(page, 'Create a workspace')).toBeVisible()
}

async function completeSetupAndSkip(page: Page, email: string, name = 'Alex') {
  await completeSetup(page, email, name)
  await page.getByRole('button', { name: 'Skip', exact: true }).click()
  await expect(page).toHaveURL(/\/dash\/workspaces$/)
  await expect(heading(page, 'Workspaces')).toBeVisible()
}

async function signInWithLink(page: Page, email: string) {
  await confirmLink(page, await requestSignInLink(page, email), email)
}

async function rawRequest(page: Page, path: string, data: object) {
  return page.request.post(path, { data, headers: { origin: origin(page) } })
}

function hold(page: Page, pattern: string) {
  let release!: () => void
  const released = new Promise<void>((resolve) => {
    release = resolve
  })
  const routes: Route[] = []
  const installed = page.route(pattern, async (route) => {
    routes.push(route)
    await released
    await route.continue()
  })
  return { installed, release, count: () => routes.length }
}

async function newSignedOutPage(browser: Browser, page: Page) {
  const context = await browser.newContext({ baseURL: origin(page) })
  return { context, page: await context.newPage() }
}

async function tabTo(page: Page, target: Locator) {
  for (let presses = 0; presses < 40; presses++) {
    await page.keyboard.press('Tab')
    if (await target.evaluate((element) => element === document.activeElement)) return
  }
  throw new Error('Keyboard focus never reached the target control')
}

async function arrowTo(page: Page, target: Locator) {
  for (let presses = 0; presses < 10; presses++) {
    if (await target.evaluate((element) => element === document.activeElement)) return
    await page.keyboard.press('ArrowDown')
  }
  throw new Error('Keyboard focus never reached the menu item')
}

async function countdownSeconds(page: Page) {
  const text = await page.getByText(throttled).textContent()
  return Number(throttled.exec(text ?? '')?.[1])
}

test('B10 concurrent confirmation of two setup links creates exactly one account', async ({
  page,
  browser,
}) => {
  const emails = [uniqueEmail('first'), uniqueEmail('second')]
  const links = [await requestSetupLink(page, emails[0]!), await requestSetupLink(page, emails[1]!)]
  const browsers = [await newSignedOutPage(browser, page), await newSignedOutPage(browser, page)]
  try {
    for (const [index, { page: claimant }] of browsers.entries()) {
      await claimant.goto(links[index]!)
      await expect(
        claimant.getByText(`Continue as ${emails[index]}`, { exact: true }),
      ).toBeVisible()
    }
    await Promise.all(
      browsers.map(({ page: claimant }) =>
        claimant.getByRole('button', { name: 'Continue', exact: true }).click(),
      ),
    )
    const outcomes: string[] = []
    for (const { page: claimant } of browsers) {
      const won = heading(claimant, 'Create a workspace')
      const lost = claimant.getByText(setupComplete, { exact: true })
      await expect(won.or(lost)).toBeVisible()
      outcomes.push((await won.isVisible()) ? 'won' : 'lost')
    }
    expect(outcomes.toSorted()).toEqual(['lost', 'won'])
    const loser = browsers[outcomes.indexOf('lost')]!.page
    await loser.goto('/dash')
    await expectSignIn(loser)
  } finally {
    for (const { context } of browsers) await context.close()
  }
})

test('B11 the same link confirmed concurrently in two browsers creates one session', async ({
  page,
  browser,
}) => {
  const email = uniqueEmail('same-link')
  const link = await requestSetupLink(page, email)
  const browsers = [await newSignedOutPage(browser, page), await newSignedOutPage(browser, page)]
  try {
    for (const { page: claimant } of browsers) {
      await claimant.goto(link)
      await expect(claimant.getByText(`Continue as ${email}`, { exact: true })).toBeVisible()
    }
    await Promise.all(
      browsers.map(({ page: claimant }) =>
        claimant.getByRole('button', { name: 'Continue', exact: true }).click(),
      ),
    )
    const outcomes: string[] = []
    for (const { page: claimant } of browsers) {
      const won = heading(claimant, 'Create a workspace')
      const lost = claimant.getByText(invalidLink, { exact: true })
      await expect(won.or(lost)).toBeVisible()
      outcomes.push((await won.isVisible()) ? 'won' : 'lost')
    }
    expect(outcomes.toSorted()).toEqual(['lost', 'won'])
    const loser = browsers[outcomes.indexOf('lost')]!.page
    await loser.goto('/dash')
    await expectSignIn(loser)
  } finally {
    for (const { context } of browsers) await context.close()
  }
})

test('B12 a stale setup tab submitted after setup completed reports completed setup', async ({
  page,
  browser,
}) => {
  await page.goto('/setup')
  await expectSetup(page)
  const winner = uniqueEmail('winner')
  const other = await newSignedOutPage(browser, page)
  try {
    await completeSetup(other.page, winner)
  } finally {
    await other.context.close()
  }
  const late = uniqueEmail('late')
  await submitSetup(page, 'Alex', late)
  await expect(page.getByText(setupComplete, { exact: true })).toBeVisible()
  await expect(page.getByText('Check your development inbox', { exact: true })).toHaveCount(0)
  await page.goto('/development-inbox')
  await expectInbox(page)
  await expect(page.getByRole('button').filter({ hasText: late })).toHaveCount(0)
  await expect(message(page, winner, setupSubject)).toHaveCount(1)
})

test('B14 signed-in visits to setup and sign-in redirect to the dashboard while the inbox stays open', async ({
  page,
}) => {
  const email = uniqueEmail('signed-in')
  await completeSetupAndSkip(page, email)
  for (const path of ['/setup', '/sign-in']) {
    await page.goto(path)
    await expect(page).toHaveURL(`${origin(page)}/dash/workspaces`)
    await expect(heading(page, 'Workspaces')).toBeVisible()
  }
  await page.goto('/development-inbox')
  await expectInbox(page)
  await expect(message(page, email, setupSubject)).toHaveCount(1)
  await page.goto('/dash/workspaces')
  await expect(heading(page, 'Workspaces')).toBeVisible()
})

test('B76 an open inbox polling in the background does not extend the session', async ({
  page,
  authService,
}) => {
  await completeSetupAndSkip(page, uniqueEmail('polling'))
  await page.goto('/development-inbox')
  await expectInbox(page)
  await authService.advance(fourteenDays - 60_000)
  for (let polls = 0; polls < 2; polls++) {
    await page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/development-inbox/messages',
    )
  }
  await authService.advance(60_000)
  await page.goto('/dash/workspaces')
  await expectSignIn(page)
  await expectPublicPage(page)
})

test('B16 unknown and known email sign-in get the same response and only the known email gets a message', async ({
  page,
}) => {
  const email = uniqueEmail('known')
  const unknown = uniqueEmail('unknown')
  await completeSetupAndSkip(page, email)
  await signOut(page, 'Alex', email)
  const responses: { status: number; body: string }[] = []
  for (const address of [unknown, email]) {
    await page.goto('/sign-in')
    await expectSignIn(page)
    const response = page.waitForResponse(
      (candidate) =>
        candidate.request().method() === 'POST' &&
        new URL(candidate.url()).pathname === '/api/auth/sign-in',
    )
    await page.getByRole('textbox', { name: 'Email' }).fill(address)
    await page.getByRole('button', { name: 'Send sign-in link', exact: true }).click()
    const received = await response
    responses.push({ status: received.status(), body: await received.text() })
    await expect(page.getByText(signInConfirmation, { exact: true })).toBeVisible()
  }
  expect(responses[0]).toEqual(responses[1])
  expect(responses[0]!.status).toBe(200)
  expect(responses[0]!.body).not.toMatch(/token/i)
  await page.goto('/development-inbox')
  await expectInbox(page)
  await expect(page.getByRole('button').filter({ hasText: unknown })).toHaveCount(0)
  await expect(message(page, email, signInSubject)).toHaveCount(1)
})

test('B18 replaying the session cookie after sign-out does not restore access', async ({
  page,
}) => {
  const email = uniqueEmail('replay')
  await completeSetupAndSkip(page, email)
  const cookies = await page.context().cookies()
  expect(cookies.filter((cookie) => cookie.httpOnly).length).toBeGreaterThan(0)
  await signOut(page, 'Alex', email)
  await page.context().addCookies(cookies)
  await page.goto('/dash/workspaces')
  await expectSignIn(page)
  await expectPublicPage(page)
})

test('B19 signing out again from a second tab after the first tab signed out succeeds', async ({
  page,
}) => {
  const email = uniqueEmail('repeat')
  await completeSetupAndSkip(page, email)
  const second = await page.context().newPage()
  await second.goto('/dash/workspaces')
  await expect(heading(second, 'Workspaces')).toBeVisible()
  await signOut(page, 'Alex', email)
  await signOut(second, 'Alex', email)
  await expect(second.getByText('Could not sign out. Try again.')).toHaveCount(0)
})

test('B20 the back button after sign-out does not show the protected page', async ({ page }) => {
  await page.addInitScript(() => {
    const flashes: string[] = []
    Object.assign(window, { authShellFlashes: flashes })
    new MutationObserver(() => {
      if (
        document.querySelector('[data-theme-scope="dashboard"], [aria-label="Open account menu"]')
      )
        flashes.push(location.pathname)
    }).observe(document, { childList: true, subtree: true, attributes: true })
  })
  const email = uniqueEmail('back')
  await completeSetupAndSkip(page, email)
  await page.getByRole('link', { name: 'Create workspace', exact: true }).click()
  await expect(heading(page, 'Create a workspace')).toBeVisible()
  await signOut(page, 'Alex', email)
  await page.evaluate(() => {
    Reflect.get(window, 'authShellFlashes').length = 0
  })
  await page.goBack()
  await expectSignIn(page)
  await expectPublicPage(page)
  expect(await page.evaluate(() => Reflect.get(window, 'authShellFlashes'))).toEqual([])
})

test('B21 another open tab follows the sign-out on its next navigation', async ({ page }) => {
  const email = uniqueEmail('tabs')
  await completeSetupAndSkip(page, email)
  const second = await page.context().newPage()
  await second.goto('/dash/workspaces')
  await expect(heading(second, 'Workspaces')).toBeVisible()
  await signOut(page, 'Alex', email)
  await second.getByRole('link', { name: 'Create workspace', exact: true }).click()
  await expectSignIn(second)
  await expectPublicPage(second)
})

test('B22 signing out in one browser leaves another browser signed in', async ({
  page,
  browser,
}) => {
  const email = uniqueEmail('other-browser')
  await completeSetupAndSkip(page, email)
  const other = await newSignedOutPage(browser, page)
  try {
    await signInWithLink(other.page, email)
    await expect(other.page).toHaveURL(/\/dash\/workspaces$/)
    await expect(heading(other.page, 'Workspaces')).toBeVisible()
    await signOut(page, 'Alex', email)
    await other.page.reload()
    await expect(heading(other.page, 'Workspaces')).toBeVisible()
    await other.page.goto('/dash/workspaces/new')
    await expect(heading(other.page, 'Create a workspace')).toBeVisible()
  } finally {
    await other.context.close()
  }
})

test('B24 a session left inactive for 14 days is signed out on the next visit', async ({
  page,
  authService,
}) => {
  await completeSetupAndSkip(page, uniqueEmail('expiry'))
  await authService.advance(fourteenDays)
  await page.goto('/dash/workspaces')
  await expectSignIn(page)
  await expectPublicPage(page)
})

test('B25 foreground navigation renews the 14-day session deadline', async ({
  page,
  authService,
}) => {
  await completeSetupAndSkip(page, uniqueEmail('renew'))
  const thirteenDays = fourteenDays - 86_400_000
  await authService.advance(thirteenDays)
  await page.goto('/dash/workspaces')
  await expect(heading(page, 'Workspaces')).toBeVisible()
  await authService.advance(thirteenDays)
  await page.goto('/dash/workspaces')
  await expect(heading(page, 'Workspaces')).toBeVisible()
  await authService.advance(fourteenDays)
  await page.goto('/dash/workspaces')
  await expectSignIn(page)
})

test('B31 hostile return targets never leave the configured origin', async ({ page }) => {
  const email = uniqueEmail('hostile-return')
  await completeSetupAndSkip(page, email)
  await signOut(page, 'Alex', email)
  const foreign: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).hostname.includes('evil')) foreign.push(request.url())
  })
  await page.goto(
    '/sign-in?callbackURL=https%3A%2F%2Fevil.test&redirect=%2F%2Fevil.test&returnTo=https%3A%2F%2Fevil.test',
  )
  await expectSignIn(page)
  const sent = page.waitForRequest(
    (request) =>
      request.method() === 'POST' && new URL(request.url()).pathname === '/api/auth/sign-in',
  )
  await page.getByRole('textbox', { name: 'Email' }).fill(email)
  await page.getByRole('button', { name: 'Send sign-in link', exact: true }).click()
  expect((await sent).postDataJSON()).toEqual({ email })
  await expect(page.getByText(signInConfirmation, { exact: true })).toBeVisible()
  for (const returnTo of [
    'https://evil.test',
    '//evil.test',
    { kind: 'url', url: 'https://evil.test' },
  ]) {
    const response = await rawRequest(page, '/api/auth/sign-in', { email, returnTo })
    expect(response.status()).toBe(400)
    expect((await response.json()).kind).toBe('invalid-input')
  }
  await page.goto('/development-inbox')
  await expectInbox(page)
  await expect(message(page, email, signInSubject)).toHaveCount(1)
  const link = await capturedLink(page, email, signInSubject)
  await confirmLink(
    page,
    `${link}&callbackURL=https%3A%2F%2Fevil.test&redirect=%2F%2Fevil.test`,
    email,
  )
  await expect(page).toHaveURL(`${origin(page)}/dash/workspaces`)
  await expect(heading(page, 'Workspaces')).toBeVisible()
  expect(foreign).toEqual([])
})

test.describe('forbidden destinations', () => {
  test.use({ expectedHttpErrors: [...fixtureHttpErrors, '/api/auth/entry'] })

  test('B32 a signed-in visit to a workspace without access falls back to the dashboard', async ({
    page,
    authService,
  }) => {
    const project = await authService.provisionProject()
    await completeSetupAndSkip(page, uniqueEmail('forbidden'))
    await page.goto(`/dash/workspaces/${project.workspaceId}/projects`)
    await expect(page).toHaveURL(`${origin(page)}/dash/workspaces`)
    await expect(heading(page, 'Workspaces')).toBeVisible()
    await expect(heading(page, 'Projects')).toHaveCount(0)
  })
})

test('B37 a superseded link that has expired shows the generic error and offers sign-in', async ({
  page,
  authService,
}) => {
  const email = uniqueEmail('superseded-expired')
  await completeSetupAndSkip(page, email)
  await signOut(page, 'Alex', email)
  const old = await requestSignInLink(page, email)
  const newest = await requestSignInLink(page, email)
  expect(newest).not.toBe(old)
  await authService.advance(300_000)
  await page.goto(old)
  await expect(page.getByText(invalidLink, { exact: true })).toBeVisible()
  await expect(page.getByText(supersededLink, { exact: true })).toHaveCount(0)
  await expect(page).toHaveURL(/\/sign-in$/)
  await expectPublicPage(page)
  await page.getByRole('link', { name: 'Sign in', exact: true }).click()
  await expectSignIn(page)
  await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible()
})

test('B38 a setup link opened as a sign-in link is invalid and stays usable for setup', async ({
  page,
}) => {
  const email = uniqueEmail('purpose')
  const link = await requestSetupLink(page, email)
  const swapped = new URL(link)
  swapped.pathname = '/sign-in'
  await page.goto(swapped.href)
  await expect(page.getByText(invalidLink, { exact: true })).toBeVisible()
  await expect(page.getByText(`Continue as ${email}`, { exact: true })).toHaveCount(0)
  await expect(page).toHaveURL(/\/sign-in$/)
  await page.getByRole('link', { name: 'Return to setup', exact: true }).click()
  await expectSetup(page)
  await confirmLink(page, link, email)
  await expect(heading(page, 'Create a workspace')).toBeVisible()
})

test('B39 a link replaced while its confirmation page is open cannot sign in', async ({ page }) => {
  const email = uniqueEmail('replaced-open')
  const link = await requestSetupLink(page, email)
  await page.goto(link)
  await expect(page.getByText(`Continue as ${email}`, { exact: true })).toBeVisible()
  const replacement = await rawRequest(page, '/api/auth/setup', { name: 'Alex', email })
  expect(replacement.status()).toBe(200)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByText(supersededLink, { exact: true })).toBeVisible()
  await expectPublicPage(page)
  await page.goto('/dash')
  await expectSetup(page)
})

test('B40 a link that expires while its confirmation page is open cannot sign in', async ({
  page,
  authService,
}) => {
  const email = uniqueEmail('expired-open')
  const link = await requestSetupLink(page, email)
  await page.goto(link)
  await expect(page.getByText(`Continue as ${email}`, { exact: true })).toBeVisible()
  await authService.advance(300_000)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByText(invalidLink, { exact: true })).toBeVisible()
  await expectPublicPage(page)
  await page.goto('/dash')
  await expectSetup(page)
})

test('B42 empty and privileged setup input is rejected in the browser and by the server', async ({
  page,
}) => {
  await page.goto('/setup')
  await expectSetup(page)
  let sent = 0
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/auth/setup') sent++
  })
  await page.locator('form button[type="submit"]').click()
  await expectFieldError(page.getByRole('textbox', { name: 'Name' }))
  await expectFieldError(page.getByRole('textbox', { name: 'Email' }))
  await submitSetup(page, 'Alex', '   ')
  await expectFieldError(page.getByRole('textbox', { name: 'Email' }))
  expect(sent).toBe(0)
  const email = uniqueEmail('privileged')
  for (const data of [
    { name: '', email: '' },
    { name: '   ', email },
    { name: 'Alex', email: 'not-an-email' },
    { name: 'Alex', email, authority: 'super_user' },
    { name: 'Alex', email, role: 'admin' },
  ]) {
    const response = await rawRequest(page, '/api/auth/setup', data)
    expect(response.status(), JSON.stringify(data)).toBe(400)
    expect((await response.json()).kind).toBe('invalid-input')
  }
  await page.goto('/development-inbox')
  await expectInbox(page)
  await expect(page.getByText('No messages yet', { exact: true })).toBeVisible()
})

test('B45 a trimmed unicode name of 120 code points keeps its internal spacing', async ({
  page,
}) => {
  const name = `Zoë  山田 ${'😀'.repeat(112)}`
  expect(Array.from(name).length).toBe(120)
  const email = uniqueEmail('unicode')
  await completeSetupAndSkip(page, email, `  ${name}  `)
  const session = await page.request.get('/api/auth/session')
  expect(session.status()).toBe(200)
  expect((await session.json()).value.user).toMatchObject({ name, email })
  await signOut(page, name, email)
})

test('B46 email length limits accept 254 characters and reject longer addresses', async ({
  page,
}) => {
  const local = 'a'.repeat(64)
  const longest = `${local}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(56)}.test`
  expect(longest.length).toBe(254)
  await page.goto('/setup')
  await expectSetup(page)
  const emailField = page.getByRole('textbox', { name: 'Email' })
  for (const tooLong of [
    `${local}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(57)}.test`,
    `${'a'.repeat(65)}@example.test`,
  ]) {
    await submitSetup(page, 'Alex', tooLong)
    await expectFieldError(emailField)
    const response = await rawRequest(page, '/api/auth/setup', { name: 'Alex', email: tooLong })
    expect(response.status()).toBe(400)
  }
  await page.goto('/setup')
  await expectSetup(page)
  await submitSetup(page, 'Alex', longest)
  await expect(page.getByText('Check your development inbox', { exact: true })).toBeVisible()
  await page.goto('/development-inbox')
  await expectInbox(page)
  const link = await capturedLink(page, longest, setupSubject)
  await page.goto(link)
  await expect(page.getByText(`Continue as ${longest}`, { exact: true })).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true)
})

test('B50 an invalid sign-in email shows a field error without sending a request', async ({
  page,
}) => {
  const email = uniqueEmail('sign-in-input')
  await completeSetupAndSkip(page, email)
  await signOut(page, 'Alex', email)
  let sent = 0
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/auth/sign-in') sent++
  })
  const emailField = page.getByRole('textbox', { name: 'Email' })
  for (const invalid of ['', '   ', 'not an email', 'alex@localhost']) {
    await emailField.fill(invalid)
    await page.getByRole('button', { name: 'Send sign-in link', exact: true }).click()
    await expectFieldError(emailField)
    await expect(page.getByText(signInConfirmation, { exact: true })).toHaveCount(0)
  }
  expect(sent).toBe(0)
})

test('B52 a double-submitted setup form sends one link', async ({ page }) => {
  const email = uniqueEmail('double-submit')
  await page.goto('/setup')
  await expectSetup(page)
  const held = hold(page, '**/api/auth/setup')
  await held.installed
  await page.getByRole('textbox', { name: 'Name' }).fill('Alex')
  await page.getByRole('textbox', { name: 'Email' }).fill(email)
  await page.locator('form button[type="submit"]').dblclick()
  await expect(page.locator('form button[type="submit"]')).toBeDisabled()
  await page.locator('form').evaluate((form: HTMLFormElement) => form.requestSubmit())
  await page.keyboard.press('Enter')
  expect(held.count()).toBe(1)
  held.release()
  await expect(page.getByText('Check your development inbox', { exact: true })).toBeVisible()
  expect(held.count()).toBe(1)
  await page.goto('/development-inbox')
  await expectInbox(page)
  await expect(message(page, email, setupSubject)).toHaveCount(1)
})

test('B53 a double-clicked Continue confirms once and enters the dashboard', async ({ page }) => {
  const email = uniqueEmail('double-continue')
  const link = await requestSetupLink(page, email)
  await page.goto(link)
  await expect(page.getByText(`Continue as ${email}`, { exact: true })).toBeVisible()
  const held = hold(page, '**/api/auth/confirm')
  await held.installed
  const proceed = page.getByRole('button', { name: 'Continue', exact: true })
  await proceed.dblclick()
  await expect(proceed).toBeDisabled()
  expect(held.count()).toBe(1)
  held.release()
  await expect(page).toHaveURL(/\/dash\/workspaces\/new$/)
  await expect(heading(page, 'Create a workspace')).toBeVisible()
  expect(held.count()).toBe(1)
  await expect(page.getByText(invalidLink, { exact: true })).toHaveCount(0)
})

test('B55 a failed sign-in request reports a retryable failure without claiming delivery', async ({
  page,
}) => {
  const email = uniqueEmail('sign-in-failure')
  await completeSetupAndSkip(page, email)
  await signOut(page, 'Alex', email)
  await page.route('**/api/auth/sign-in', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ kind: 'temporary-failure' }),
    }),
  )
  await page.getByRole('textbox', { name: 'Email' }).fill(email)
  await page.getByRole('button', { name: 'Send sign-in link', exact: true }).click()
  await expect(page.getByText(requestFailed, { exact: true })).toBeVisible()
  await expect(page.getByText(signInConfirmation, { exact: true })).toHaveCount(0)
  await page.unroute('**/api/auth/sign-in')
  await page.getByRole('button', { name: 'Send sign-in link', exact: true }).click()
  await expect(page.getByText(signInConfirmation, { exact: true })).toBeVisible()
  await expect(page.getByText(requestFailed, { exact: true })).toHaveCount(0)
})

test.describe('session check failure', () => {
  test.use({ expectedHttpErrors: [...fixtureHttpErrors, '/api/auth/state'] })

  test('B56 an unavailable session check shows Retry and recovers', async ({ page }) => {
    await page.route('**/api/auth/state', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ kind: 'temporary-failure' }),
      }),
    )
    await page.goto('/dash')
    await expect(
      page.getByText('Could not load your session. Please try again.', { exact: true }),
    ).toBeVisible()
    await expectPublicPage(page)
    await page.unroute('**/api/auth/state')
    await page.getByRole('button', { name: 'Retry', exact: true }).click()
    await expectSetup(page)
  })
})

test('B57 a failed confirmation explains how to continue without signing in', async ({ page }) => {
  const email = uniqueEmail('confirm-failure')
  const link = await requestSetupLink(page, email)
  await page.goto(link)
  await expect(page.getByText(`Continue as ${email}`, { exact: true })).toBeVisible()
  await page.route('**/api/auth/confirm', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ kind: 'temporary-failure' }),
    }),
  )
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(
    page.getByText('Could not confirm this link. Try again or request a new link.', {
      exact: true,
    }),
  ).toBeVisible()
  await expectPublicPage(page)
  await page.unroute('**/api/auth/confirm')
  await page.getByRole('link', { name: 'Return to setup', exact: true }).click()
  await expectSetup(page)
})

test.describe('sign-out failure', () => {
  test.use({ expectedHttpErrors: [...fixtureHttpErrors, '/api/auth/sign-out'] })

  test('B58 a failed sign-out keeps the session and a retry signs out', async ({ page }) => {
    const email = uniqueEmail('sign-out-failure')
    await completeSetupAndSkip(page, email)
    await page.route('**/api/auth/sign-out', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ kind: 'temporary-failure' }),
      }),
    )
    await page.getByRole('button', { name: 'Open account menu', exact: true }).click()
    await page.getByRole('menu').getByRole('menuitem', { name: 'Log out', exact: true }).click()
    await expect(page.getByText('Could not sign out. Try again.', { exact: true })).toBeVisible()
    await expect(page).toHaveURL(/\/dash\/workspaces$/)
    await page.unroute('**/api/auth/sign-out')
    await page.reload()
    await expect(heading(page, 'Workspaces')).toBeVisible()
    await signOut(page, 'Alex', email)
  })
})

test('B60 a failed inbox message open offers Retry and recovers', async ({ page }) => {
  const email = uniqueEmail('inbox-open')
  await page.goto('/setup')
  await expectSetup(page)
  await submitSetup(page, 'Alex', email)
  await expect(page.getByText('Check your development inbox', { exact: true })).toBeVisible()
  await page.goto('/development-inbox')
  await expectInbox(page)
  await page.route('**/api/development-inbox/messages/*/open', (route) => route.abort())
  await message(page, email, setupSubject).click()
  await expect(
    page.getByText('Could not open this message. Try again.', { exact: true }),
  ).toBeVisible()
  await page.unroute('**/api/development-inbox/messages/*/open')
  await page
    .getByRole('region', { name: 'Reading pane', exact: true })
    .getByRole('button', { name: 'Retry', exact: true })
    .click()
  await expect(
    page
      .getByRole('region', { name: 'Reading pane', exact: true })
      .getByRole('link', { name: 'Continue', exact: true }),
  ).toBeVisible()
})

test('B63 a throttled setup request counts down and leaves the newest link valid', async ({
  page,
}) => {
  const email = uniqueEmail('countdown')
  await page.goto('/setup')
  await expectSetup(page)
  for (let index = 0; index < 5; index++) {
    expect((await rawRequest(page, '/api/auth/setup', { name: 'Alex', email })).status()).toBe(200)
  }
  await submitSetup(page, 'Alex', email)
  await expect(page.getByText(throttled)).toBeVisible()
  await expect(page.locator('form button[type="submit"]')).toBeDisabled()
  const first = await countdownSeconds(page)
  expect(first).toBeGreaterThan(1)
  expect(first).toBeLessThanOrEqual(300)
  await expect.poll(() => countdownSeconds(page), { timeout: 5_000 }).toBeLessThan(first)
  await expect(page.getByText('Check your development inbox', { exact: true })).toHaveCount(0)
  await page.goto('/development-inbox')
  await expectInbox(page)
  await expect(message(page, email, setupSubject)).toHaveCount(5)
  await confirmLink(page, await capturedLink(page, email, setupSubject), email)
  await expect(heading(page, 'Create a workspace')).toBeVisible()
})

test('B64 unknown-email sign-in requests are throttled like known ones without blocking other emails', async ({
  page,
}) => {
  const email = uniqueEmail('known-limit')
  const unknown = uniqueEmail('unknown-limit')
  await completeSetupAndSkip(page, email)
  await signOut(page, 'Alex', email)
  for (let index = 0; index < 5; index++) {
    expect((await rawRequest(page, '/api/auth/sign-in', { email: unknown })).status()).toBe(200)
  }
  await page.getByRole('textbox', { name: 'Email' }).fill(unknown)
  await page.getByRole('button', { name: 'Send sign-in link', exact: true }).click()
  await expect(page.getByText(throttled)).toBeVisible()
  await expect(page.getByText(signInConfirmation, { exact: true })).toHaveCount(0)
  await page.goto('/sign-in')
  await expectSignIn(page)
  await page.getByRole('textbox', { name: 'Email' }).fill(email)
  await page.getByRole('button', { name: 'Send sign-in link', exact: true }).click()
  await expect(page.getByText(signInConfirmation, { exact: true })).toBeVisible()
  await page.goto('/development-inbox')
  await expectInbox(page)
  await expect(message(page, email, signInSubject)).toHaveCount(1)
  await expect(page.getByRole('button').filter({ hasText: unknown })).toHaveCount(0)
})

test('B65 changing the recipient cannot bypass the per-source request limit', async ({ page }) => {
  await page.goto('/setup')
  await expectSetup(page)
  for (let index = 0; index < 10; index++) {
    const response = await rawRequest(page, '/api/auth/setup', {
      name: 'Alex',
      email: uniqueEmail(`source-${index}`),
    })
    expect(response.status()).toBe(200)
  }
  const fresh = uniqueEmail('fresh')
  await submitSetup(page, 'Alex', fresh)
  await expect(page.getByText(throttled)).toBeVisible()
  await page.goto('/development-inbox')
  await expectInbox(page)
  await expect(page.getByRole('button').filter({ hasText: setupSubject })).toHaveCount(10)
  await expect(page.getByRole('button').filter({ hasText: fresh })).toHaveCount(0)
})

test('B66 throttling is temporary and a request is accepted once the window passes', async ({
  page,
  authService,
}) => {
  const email = uniqueEmail('recover')
  await page.goto('/setup')
  await expectSetup(page)
  for (let index = 0; index < 5; index++) {
    expect((await rawRequest(page, '/api/auth/setup', { name: 'Alex', email })).status()).toBe(200)
  }
  await submitSetup(page, 'Alex', email)
  await expect(page.getByText(throttled)).toBeVisible()
  await authService.advance(300_000)
  await page.reload()
  await expectSetup(page)
  await submitSetup(page, 'Alex', email)
  await expect(page.getByText('Check your development inbox', { exact: true })).toBeVisible()
  await page.goto('/development-inbox')
  await expectInbox(page)
  await expect(message(page, email, setupSubject)).toHaveCount(6)
})

test.describe('disabled mode', () => {
  test.use({ authEnvironment: { AIRCASTLE_ENV: 'production' } })

  test('B67 without local mode every auth page shows the configuration message and the inbox is closed', async ({
    page,
  }) => {
    for (const path of ['/setup', '/sign-in', '/dash', '/dash/workspaces', '/development-inbox']) {
      await page.goto(path)
      await expect(page.getByText(disabled, { exact: true })).toBeVisible()
      await expectPublicPage(page)
      await expect(page.getByRole('textbox')).toHaveCount(0)
    }
    expect((await page.request.get('/api/development-inbox/messages')).status()).toBe(404)
    const setup = await rawRequest(page, '/api/auth/setup', {
      name: 'Alex',
      email: uniqueEmail('disabled'),
    })
    expect(setup.status()).toBe(404)
  })
})

test('B70 setup, confirmation, onboarding, sign-out and sign-in work with the keyboard only', async ({
  page,
}) => {
  const email = uniqueEmail('keyboard')
  await page.goto('/setup')
  await expectSetup(page)
  await tabTo(page, page.getByRole('textbox', { name: 'Name' }))
  await page.keyboard.type('Alex')
  await tabTo(page, page.getByRole('textbox', { name: 'Email' }))
  await page.keyboard.type(email)
  await page.keyboard.press('Enter')
  const inboxLink = page.getByRole('link', { name: 'Open development inbox', exact: true })
  await expect(inboxLink).toBeVisible()
  await tabTo(page, inboxLink)
  await page.keyboard.press('Enter')
  await expectInbox(page)
  const setupMessage = message(page, email, setupSubject)
  await tabTo(page, setupMessage)
  await page.keyboard.press('Enter')
  const continueLink = page
    .getByRole('region', { name: 'Reading pane', exact: true })
    .getByRole('link', { name: 'Continue', exact: true })
  await expect(continueLink).toBeVisible()
  await tabTo(page, continueLink)
  await page.keyboard.press('Enter')
  await expect(page.getByText(`Continue as ${email}`, { exact: true })).toBeVisible()
  await tabTo(page, page.getByRole('button', { name: 'Continue', exact: true }))
  await page.keyboard.press('Enter')
  await expect(heading(page, 'Create a workspace')).toBeVisible()
  await tabTo(page, page.getByRole('button', { name: 'Skip', exact: true }))
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/dash\/workspaces$/)
  await expect(heading(page, 'Workspaces')).toBeVisible()
  await tabTo(page, page.getByRole('button', { name: 'Open account menu', exact: true }))
  await page.keyboard.press('Enter')
  const logOut = page.getByRole('menu').getByRole('menuitem', { name: 'Log out', exact: true })
  await expect(logOut).toBeVisible()
  await arrowTo(page, logOut)
  await page.keyboard.press('Enter')
  await expectSignIn(page)

  const emailField = page.getByRole('textbox', { name: 'Email' })
  await expect(emailField).toBeFocused()
  await page.keyboard.type(email)
  await page.keyboard.press('Enter')
  await expect(page.getByText(signInConfirmation, { exact: true })).toBeVisible()
  await tabTo(page, inboxLink)
  await page.keyboard.press('Enter')
  await expectInbox(page)
  const signInMessage = message(page, email, signInSubject)
  await tabTo(page, signInMessage)
  await page.keyboard.press('Enter')
  await expect(continueLink).toBeVisible()
  await tabTo(page, continueLink)
  await page.keyboard.press('Enter')
  await expect(page.getByText(`Continue as ${email}`, { exact: true })).toBeVisible()
  await tabTo(page, page.getByRole('button', { name: 'Continue', exact: true }))
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/dash\/workspaces$/)
  await expect(heading(page, 'Workspaces')).toBeVisible()
})

test('B77 a member signing in without a requested page returns to the last visited workspace', async ({
  page,
  authService,
}) => {
  const project = await authService.provisionProject()
  const email = uniqueEmail('member')
  await completeSetupAndSkip(page, email)
  await authService.grantWorkspace(email, project.workspaceId)
  const projects = `/dash/workspaces/${project.workspaceId}/projects`
  await page.goto(projects)
  await expect(heading(page, 'Projects')).toBeVisible()
  await signOut(page, 'Alex', email)
  await signInWithLink(page, email)
  await expect(page).toHaveURL(`${origin(page)}${projects}`)
  await expect(heading(page, 'Projects')).toBeVisible()
})
