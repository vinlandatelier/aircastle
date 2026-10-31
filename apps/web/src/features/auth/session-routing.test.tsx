import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'
import {
  deferredResponse,
  displayHttp,
  expectNoShell,
  failure,
  mountAuth,
  ok,
  protectedPath,
  session,
} from './test-support'

function authenticatedHttp(destination: object = { kind: 'workspaces' }) {
  return displayHttp({
    'GET /api/auth/state': () => ok({ kind: 'authenticated', session }),
    'GET /api/auth/session': () => ok(session),
    'POST /api/auth/activity': () => ok(session),
    'POST /api/auth/entry': () => ok({ destination }),
  })
}

describe('Session routing over display-only HTTP doubles', () => {
  it.each(['/dash', '/sign-in', protectedPath])(
    '[auth:R2] routes setup-required entry %s to setup without a sign-in action or shell',
    async (path) => {
      const http = displayHttp({ 'GET /api/auth/state': () => ok({ kind: 'setup-required' }) })
      const { router } = await mountAuth(path, http)

      expect(
        await screen.findByRole('heading', { name: 'Create your super user account' }),
      ).toBeTruthy()
      expect(router.state.location.pathname).toBe('/setup')
      expect(screen.queryByRole('link', { name: /sign in/i })).toBeNull()
      expect(screen.queryByRole('button', { name: /sign in/i })).toBeNull()
      expectNoShell()
    },
  )

  it.each(['/dash', '/setup', protectedPath])(
    '[auth:R6] routes signed-out entry %s to sign-in without public registration',
    async (path) => {
      const { router } = await mountAuth(path, displayHttp())

      expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy()
      expect(router.state.location.pathname).toBe('/sign-in')
      expect(screen.getByRole('button', { name: 'Send sign-in link' })).toBeTruthy()
      expect(screen.queryByRole('link', { name: /register|sign up|create.*account/i })).toBeNull()
      expect(
        screen.queryByRole('button', {
          name: /register|sign up|password|passkey|authenticator|Google|GitHub/i,
        }),
      ).toBeNull()
      expectNoShell()
    },
  )

  it('[auth:R1] disabled auth explains configuration and offers no mutations or inbox', async () => {
    const http = displayHttp({ 'GET /api/auth/state': () => ok({ kind: 'disabled' }) })
    await mountAuth(protectedPath, http)

    expect(
      await screen.findByText(
        'Local authentication is not enabled. For local development, set AIRCASTLE_ENV=development.',
        { exact: true },
      ),
    ).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('link', { name: /inbox/i })).toBeNull()
    expect(http.requests.filter((request) => request.method === 'POST')).toHaveLength(0)
    expectNoShell()
  })

  it('[auth:R7] renders no protected shell during unresolved initial state, then shows the resolved user', async () => {
    const pending = deferredResponse()
    const delayed = displayHttp({
      'GET /api/auth/state': () => pending.promise,
      'GET /api/auth/session': () => ok(session),
      'POST /api/auth/activity': () => ok(session),
      'POST /api/auth/entry': () => ok({ destination: { kind: 'workspaces' } }),
    })
    const { user } = await mountAuth(protectedPath, delayed)

    expectNoShell()
    await waitFor(() => expect(delayed.calls('/auth/state', 'GET')).toHaveLength(1))
    await act(async () => pending.resolve(ok({ kind: 'authenticated', session })))
    await user.click(await screen.findByRole('button', { name: 'Open account menu' }))
    expect(
      within(await screen.findByRole('menu')).getByText('Alex Example', { exact: true }),
    ).toBeTruthy()
    expect(screen.getByText('alex@example.test', { exact: true })).toBeTruthy()
  })

  it('[auth:R7] unresolved session cannot show the shell and a missing session goes to sign-in', async () => {
    const pending = deferredResponse()
    const http = displayHttp({
      'GET /api/auth/state': () => pending.promise,
    })
    const { router } = await mountAuth(protectedPath, http)

    expectNoShell()
    await act(async () => pending.resolve(ok({ kind: 'signed-out' })))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy()
    expect(router.state.location.pathname).toBe('/sign-in')
    expectNoShell()
  })

  it('[auth:R7] state load failure stays outside the shell and Retry resolves the state again', async () => {
    let reads = 0
    const http = displayHttp({
      'GET /api/auth/state': () => {
        reads += 1
        return reads === 1 ? failure('temporary-failure') : ok({ kind: 'signed-out' })
      },
    })
    const { user } = await mountAuth(protectedPath, http)

    expect((await screen.findByRole('alert')).textContent).toMatch(/try again/i)
    expectNoShell()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy()
    expect(http.calls('/auth/state', 'GET')).toHaveLength(2)
    expectNoShell()
  })

  it.each(['/setup', '/sign-in'])(
    '[auth:R7] authenticated entry %s redirects through dash to the server-selected destination',
    async (path) => {
      const { router } = await mountAuth(path, authenticatedHttp())

      expect(await screen.findByRole('heading', { name: 'Workspaces' })).toBeTruthy()
      expect(router.state.location.pathname).toBe('/dash/workspaces')
    },
  )

  it.each([
    [{ kind: 'create-workspace' }, '/dash/workspaces/new', 'Create a workspace'],
    [{ kind: 'workspaces' }, '/dash/workspaces', 'Workspaces'],
    [
      { kind: 'workspace-projects', workspaceId: 'remembered' },
      '/dash/workspaces/remembered/projects',
      'Projects',
    ],
  ] as const)(
    '[auth:R4] renders the dummy destination %s with no creation form',
    async (destination, path, title) => {
      const { router } = await mountAuth('/dash', authenticatedHttp(destination))

      expect(await screen.findByRole('heading', { name: title })).toBeTruthy()
      expect(router.state.location.pathname).toBe(path)
      expect(screen.queryByRole('textbox', { name: /workspace.*name|name.*workspace/i })).toBeNull()
      expect(screen.queryByRole('button', { name: /create workspace/i })).toBeNull()
    },
  )

  it('[auth:R4] Skip leaves onboarding for Workspaces and offers manual navigation back', async () => {
    let entries = 0
    const http = displayHttp({
      'GET /api/auth/state': () => ok({ kind: 'authenticated', session }),
      'GET /api/auth/session': () => ok(session),
      'POST /api/auth/activity': () => ok(session),
      'POST /api/auth/entry': () => {
        entries += 1
        return ok({ destination: { kind: entries === 1 ? 'create-workspace' : 'workspaces' } })
      },
    })
    const { router, user } = await mountAuth('/dash', http)
    await user.click(await screen.findByRole('button', { name: 'Skip' }))

    expect(await screen.findByRole('heading', { name: 'Workspaces' })).toBeTruthy()
    expect(router.state.location.pathname).toBe('/dash/workspaces')
    expect(screen.getByRole('link', { name: 'Create workspace' }).getAttribute('href')).toBe(
      '/dash/workspaces/new',
    )
    expect(http.calls('/auth/entry').length).toBeGreaterThanOrEqual(2)
    const bodies = await Promise.all(http.calls('/auth/entry').map((request) => request.json()))
    expect(bodies).toContainEqual({ kind: 'skip-onboarding' })
  })

  it('[auth:R7] the account menu displays the resolved name and email', async () => {
    const { user } = await mountAuth(protectedPath, authenticatedHttp())
    await user.click(await screen.findByRole('button', { name: 'Open account menu' }))
    const menu = await screen.findByRole('menu')

    expect(within(menu).getByText('Alex Example', { exact: true })).toBeTruthy()
    expect(within(menu).getByText('alex@example.test', { exact: true })).toBeTruthy()
  })

  it('[auth:R7] signs out through HTTP before leaving the shell', async () => {
    let signedIn = true
    const signingOut = deferredResponse()
    const transport = displayHttp({
      'GET /api/auth/state': () =>
        ok(signedIn ? { kind: 'authenticated', session } : { kind: 'signed-out' }),
      'GET /api/auth/session': () => (signedIn ? ok(session) : failure('unauthenticated', 401)),
      'POST /api/auth/activity': () => (signedIn ? ok(session) : failure('unauthenticated', 401)),
      'POST /api/auth/entry': () => ok({ destination: { kind: 'workspaces' } }),
      'POST /api/auth/sign-out': () => signingOut.promise,
    })
    const { router, user } = await mountAuth(protectedPath, transport)
    await user.click(await screen.findByRole('button', { name: 'Open account menu' }))
    const menu = await screen.findByRole('menu')
    await user.click(within(menu).getByRole('menuitem', { name: 'Log out' }))

    await waitFor(() => expect(transport.calls('/auth/sign-out')).toHaveLength(1))
    signedIn = false
    await act(async () => signingOut.resolve(ok({ destination: '/sign-in' })))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy()
    expect(router.state.location.pathname).toBe('/sign-in')
    expectNoShell()
  })

  it('[auth:R7] foreground navigation sends activity and observes subsequent session loss', async () => {
    let active = true
    const http = displayHttp({
      'GET /api/auth/state': () =>
        ok(active ? { kind: 'authenticated', session } : { kind: 'signed-out' }),
      'GET /api/auth/session': () => (active ? ok(session) : failure('unauthenticated', 401)),
      'POST /api/auth/activity': () => (active ? ok(session) : failure('unauthenticated', 401)),
      'POST /api/auth/entry': () =>
        active ? ok({ destination: { kind: 'workspaces' } }) : failure('unauthenticated', 401),
    })
    const { history, router } = await mountAuth(protectedPath, http)
    await screen.findByRole('button', { name: 'Open account menu' })
    await waitFor(() => expect(http.calls('/auth/activity').length).toBeGreaterThan(0))
    const initialActivity = http.calls('/auth/activity').length
    await act(async () => history.push('/dash/workspaces'))
    expect(await screen.findByRole('heading', { name: 'Workspaces' })).toBeTruthy()
    await waitFor(() =>
      expect(http.calls('/auth/activity').length).toBeGreaterThan(initialActivity),
    )
    active = false
    await act(async () => history.push(protectedPath))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy()
    expect(router.state.location.pathname).toBe('/sign-in')
    expectNoShell()
  })
})
