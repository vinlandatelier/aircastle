import { act, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import {
  deferredResponse,
  displayHttp,
  expectFieldError,
  expectNoShell,
  failure,
  mountAuth,
  ok,
  submitSetup,
  submitSignIn,
} from './test-support'

afterEach(() => vi.useRealTimers())

describe('Auth forms over display-only HTTP doubles', () => {
  it.each([
    ['missing name', '', 'alex@example.test', /name/i],
    ['blank name', '   ', 'alex@example.test', /name/i],
    ['121 code points', '😀'.repeat(121), 'alex@example.test', /name/i],
    ['missing email', 'Alex', '', /email/i],
    ['consecutive dots', 'Alex', 'alex..demo@example.test', /email/i],
    ['Unicode email', 'Alex', 'áléx@example.test', /email/i],
  ] as const)(
    '[auth:R2] setup rejects %s at its field without sending a request',
    async (_case, name, email, label) => {
      const http = displayHttp({ 'GET /api/auth/state': () => ok({ kind: 'setup-required' }) })
      const { user } = await mountAuth('/setup', http)
      await submitSetup(user, name, email)

      await expectFieldError(screen.getByRole('textbox', { name: label }))
      expect(http.calls('/auth/setup')).toHaveLength(0)
      expectNoShell()
    },
  )

  it('[auth:R2] setup accepts 120 Unicode code points and preserves internal spaces', async () => {
    const http = displayHttp({
      'GET /api/auth/state': () => ok({ kind: 'setup-required' }),
      'POST /api/auth/setup': () => ok({ confirmation: 'setup-inbox' }),
    })
    const { user } = await mountAuth('/setup', http)
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy()
    expect(screen.queryByText(/Local delivery does not send email/)).toBeNull()
    const name = `${'😀'.repeat(116)}A  B`
    await submitSetup(user, `  ${name}  `, '  ALEX+Demo@EXAMPLE.TEST  ')

    await waitFor(() => expect(http.calls('/auth/setup')).toHaveLength(1))
    expect(await http.calls('/auth/setup')[0]?.json()).toEqual({
      name,
      email: 'alex+demo@example.test',
    })
    expect(await screen.findByText('Check your development inbox', { exact: true })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open development inbox' }).getAttribute('href')).toBe(
      '/development-inbox',
    )
    expectNoShell()
  })

  it('[auth:R2] attaches a server initial-email restriction to the email field', async () => {
    const http = displayHttp({
      'GET /api/auth/state': () => ok({ kind: 'setup-required' }),
      'POST /api/auth/setup': () => failure('email-not-allowed', 403),
    })
    const { user } = await mountAuth('/setup', http)
    await submitSetup(user, 'Alex', 'alex@example.test')

    expect(
      await screen.findByText('This email is not allowed for initial setup', { exact: true }),
    ).toBeTruthy()
    await expectFieldError(screen.getByRole('textbox', { name: /email/i }))
    expect(screen.queryByText('Check your development inbox')).toBeNull()
  })

  it.each(['', 'alex..demo@example.test', 'áléx@example.test'])(
    '[auth:R2] sign-in rejects invalid email %j without requesting a link',
    async (email) => {
      const http = displayHttp()
      const { user } = await mountAuth('/sign-in', http)
      await submitSignIn(user, email)

      await expectFieldError(screen.getByRole('textbox', { name: 'Email' }))
      expect(http.calls('/auth/sign-in')).toHaveLength(0)
    },
  )

  it.each(['known@example.test', 'unknown@example.test'])(
    '[auth:R6] gives the same neutral confirmation for %s',
    async (email) => {
      const http = displayHttp({
        'POST /api/auth/sign-in': () => ok({ confirmation: 'sign-in-inbox' }),
      })
      const { user } = await mountAuth('/sign-in', http)
      expect(screen.queryByText(/Local delivery does not send email/)).toBeNull()
      await submitSignIn(user, `  ${email.toUpperCase()}  `)

      expect(
        await screen.findByText(
          'If this account exists, a sign-in link is available in the development inbox.',
          { exact: true },
        ),
      ).toBeTruthy()
      expect(http.calls('/auth/sign-in')).toHaveLength(1)
      expect(await http.calls('/auth/sign-in')[0]?.json()).toEqual({ email })
      expectNoShell()
    },
  )

  it('[auth:R6] disables submission while pending and ignores repeated Enter and clicks', async () => {
    const pending = deferredResponse()
    const http = displayHttp({ 'POST /api/auth/sign-in': () => pending.promise })
    const { user } = await mountAuth('/sign-in', http)
    await submitSignIn(user, 'alex@example.test')

    await waitFor(() => expect(http.calls('/auth/sign-in')).toHaveLength(1))
    const button = screen.getByRole('button', { name: /send sign-in link|sending/i })
    expect(button.hasAttribute('disabled')).toBe(true)
    await user.keyboard('{Enter}{Enter}')
    await user.click(button)
    expect(http.calls('/auth/sign-in')).toHaveLength(1)
    await act(async () => pending.resolve(ok({ confirmation: 'sign-in-inbox' })))
    expect(
      await screen.findByText(
        'If this account exists, a sign-in link is available in the development inbox.',
        { exact: true },
      ),
    ).toBeTruthy()
  })

  it('[auth:R3] disables setup submission while its link request is pending', async () => {
    const pending = deferredResponse()
    const http = displayHttp({
      'GET /api/auth/state': () => ok({ kind: 'setup-required' }),
      'POST /api/auth/setup': () => pending.promise,
    })
    const { user } = await mountAuth('/setup', http)
    await submitSetup(user, 'Alex', 'alex@example.test')

    await waitFor(() => expect(http.calls('/auth/setup')).toHaveLength(1))
    const button = screen.getByRole('button', {
      name: /send.*link|create.*account|continue|sending/i,
    })
    expect(button.hasAttribute('disabled')).toBe(true)
    await user.keyboard('{Enter}{Enter}')
    await user.click(button)
    expect(http.calls('/auth/setup')).toHaveLength(1)
    await act(async () => pending.resolve(ok({ confirmation: 'setup-inbox' })))
    expect(await screen.findByText('Check your development inbox', { exact: true })).toBeTruthy()
  })

  it.each(['response', 'network'])(
    '[auth:R3] reports %s failure without claiming delivery, then permits retry',
    async (mode) => {
      let attempts = 0
      const http = displayHttp({
        'POST /api/auth/sign-in': () => {
          attempts += 1
          if (attempts > 1) return ok({ confirmation: 'sign-in-inbox' })
          if (mode === 'network') return Promise.reject(new TypeError('display-only network fault'))
          return failure('temporary-failure')
        },
      })
      const { user } = await mountAuth('/sign-in', http)
      await submitSignIn(user, 'alex@example.test')

      expect(
        await screen.findByText('Could not create your sign-in email. Try again.', { exact: true }),
      ).toBeTruthy()
      expect(screen.queryByText(/If this account exists/)).toBeNull()
      const button = screen.getByRole('button', { name: 'Send sign-in link' })
      expect(button.hasAttribute('disabled')).toBe(false)
      await user.click(button)
      expect(
        await screen.findByText(
          'If this account exists, a sign-in link is available in the development inbox.',
          { exact: true },
        ),
      ).toBeTruthy()
      expect(http.calls('/auth/sign-in')).toHaveLength(2)
      expectNoShell()
    },
  )

  it('[auth:R9] counts down a throttle and enables retry only when its wait expires', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'))
    let attempts = 0
    const http = displayHttp({
      'POST /api/auth/sign-in': () => {
        attempts += 1
        return attempts === 1
          ? failure('throttled', 429, { retryAt: Date.now() + 2000 })
          : ok({ confirmation: 'sign-in-inbox' })
      },
    })
    const { user } = await mountAuth('/sign-in', http)
    await submitSignIn(user, 'alex@example.test')

    expect(
      await screen.findByText('Too many requests. Try again in 2 seconds.', { exact: true }),
    ).toBeTruthy()
    const button = screen.getByRole('button', { name: 'Send sign-in link' })
    expect(button.hasAttribute('disabled')).toBe(true)
    vi.setSystemTime(new Date('2030-01-01T00:00:01Z'))
    expect(
      await screen.findByText('Too many requests. Try again in 1 second.', { exact: true }),
    ).toBeTruthy()
    await user.click(button)
    expect(http.calls('/auth/sign-in')).toHaveLength(1)
    vi.setSystemTime(new Date('2030-01-01T00:00:02Z'))
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false))
    await user.click(button)
    expect(
      await screen.findByText(
        'If this account exists, a sign-in link is available in the development inbox.',
        { exact: true },
      ),
    ).toBeTruthy()
    expect(http.calls('/auth/sign-in')).toHaveLength(2)
  })
})
