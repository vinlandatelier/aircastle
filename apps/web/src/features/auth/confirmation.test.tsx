import { act, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'
import {
  deferredResponse,
  displayHttp,
  expectNoShell,
  failure,
  mountAuth,
  ok,
  session,
} from './test-support'

describe('Confirmation display over HTTP doubles, without authentication proof', () => {
  it.each(['setup', 'sign-in'] as const)(
    '[auth:R4] %s preview shows identity, removes the token and waits for explicit confirmation',
    async (purpose) => {
      const http = displayHttp({
        'POST /api/auth/confirm/preview': () => ok({ email: 'alex@example.test', purpose }),
      })
      const { router } = await mountAuth(`/${purpose}?token=display-token`, http)

      expect(await screen.findByText('Continue as alex@example.test', { exact: true })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy()
      await waitFor(() => expect(router.state.location.searchStr).toBe(''))
      expect(http.calls('/auth/confirm')).toHaveLength(0)
      expect(http.calls('/auth/confirm/preview')).toHaveLength(1)
      expect(await http.calls('/auth/confirm/preview')[0]?.json()).toEqual({
        purpose,
        token: 'display-token',
      })
      expectNoShell()
    },
  )

  it.each([
    {
      kind: 'invalid-link',
      status: 400,
      copy: 'This link is invalid or has expired. Request a new link.',
    },
    {
      kind: 'superseded-link',
      status: 400,
      copy: 'A newer sign-in link was requested. Use the latest email.',
    },
  ])(
    '[auth:R5] displays exact $kind copy and the instance-appropriate return action',
    async ({ kind, status, copy }) => {
      const http = displayHttp({
        'POST /api/auth/confirm/preview': () => failure(kind, status, { next: 'sign-in' }),
      })
      const { router } = await mountAuth('/setup?token=display-token', http)

      expect(await screen.findByText(copy, { exact: true })).toBeTruthy()
      expect(screen.getByRole('link', { name: /sign in/i }).getAttribute('href')).toBe('/sign-in')
      expect(router.state.location.searchStr).toBe('')
      expect(http.calls('/auth/confirm')).toHaveLength(0)
      expectNoShell()
    },
  )

  it('[auth:R5] an invalid link before setup offers setup rather than sign-in', async () => {
    const http = displayHttp({
      'GET /api/auth/state': () => ok({ kind: 'setup-required' }),
      'POST /api/auth/confirm/preview': () => failure('invalid-link', 400, { next: 'setup' }),
    })
    await mountAuth('/setup?token=display-token', http)

    expect(
      await screen.findByText('This link is invalid or has expired. Request a new link.', {
        exact: true,
      }),
    ).toBeTruthy()
    expect(screen.getByRole('link', { name: /setup|create.*account/i }).getAttribute('href')).toBe(
      '/setup',
    )
    expect(screen.queryByRole('link', { name: /sign in/i })).toBeNull()
    expectNoShell()
  })

  it('[auth:R4] displays exact completed-setup copy for a valid losing setup link', async () => {
    const http = displayHttp({
      'POST /api/auth/confirm/preview': () => failure('setup-complete', 409),
    })
    const { router } = await mountAuth('/setup?token=display-token', http)

    expect(
      await screen.findByText('Setup is complete. Sign in to continue', { exact: true }),
    ).toBeTruthy()
    expect(screen.getByRole('link', { name: /sign in/i }).getAttribute('href')).toBe('/sign-in')
    expect(router.state.location.searchStr).toBe('')
    expectNoShell()
  })

  it('[auth:R4] ignores double confirmation while pending, then uses the server destination', async () => {
    const pending = deferredResponse()
    let authenticated = false
    const http = displayHttp({
      'POST /api/auth/confirm/preview': () => ok({ email: 'alex@example.test', purpose: 'setup' }),
      'POST /api/auth/confirm': () => pending.promise,
      'GET /api/auth/state': () =>
        ok(authenticated ? { kind: 'authenticated', session } : { kind: 'setup-required' }),
      'GET /api/auth/session': () =>
        authenticated ? ok(session) : failure('unauthenticated', 401),
      'POST /api/auth/activity': () => ok(session),
      'POST /api/auth/entry': () => ok({ destination: { kind: 'create-workspace' } }),
    })
    const { router, user } = await mountAuth('/setup?token=display-token', http)
    const button = await screen.findByRole('button', { name: 'Continue' })
    await user.click(button)

    await waitFor(() => expect(http.calls('/auth/confirm')).toHaveLength(1))
    expect(button.hasAttribute('disabled')).toBe(true)
    await user.click(button)
    await user.keyboard('{Enter}{Enter}')
    expect(http.calls('/auth/confirm')).toHaveLength(1)
    expectNoShell()
    authenticated = true
    await act(async () => pending.resolve(ok({ destination: { kind: 'dashboard' } })))
    expect(await screen.findByRole('heading', { name: 'Create a workspace' })).toBeTruthy()
    expect(router.state.location.pathname).toBe('/dash/workspaces/new')
    expect(router.state.location.searchStr).toBe('')
  })

  it('[auth:R4] handles setup closing between preview and confirmation', async () => {
    const http = displayHttp({
      'POST /api/auth/confirm/preview': () => ok({ email: 'alex@example.test', purpose: 'setup' }),
      'POST /api/auth/confirm': () => failure('setup-complete', 409),
    })
    const { user } = await mountAuth('/setup?token=display-token', http)
    await user.click(await screen.findByRole('button', { name: 'Continue' }))

    expect(
      await screen.findByText('Setup is complete. Sign in to continue', { exact: true }),
    ).toBeTruthy()
    expectNoShell()
  })

  it('[auth:R5] confirmation failure gives recovery without leaking transport details', async () => {
    const http = displayHttp({
      'POST /api/auth/confirm/preview': () =>
        ok({ email: 'alex@example.test', purpose: 'sign-in' }),
      'POST /api/auth/confirm': () =>
        failure('temporary-failure', 503, { detail: 'postgres display-secret stack trace' }),
    })
    const { user } = await mountAuth('/sign-in?token=display-token', http)
    await user.click(await screen.findByRole('button', { name: 'Continue' }))

    expect((await screen.findByRole('alert')).textContent).toMatch(
      /try again|request.*link|sign in/i,
    )
    expect(screen.queryByText(/postgres|display-secret|stack trace/i)).toBeNull()
    expectNoShell()
  })
})
