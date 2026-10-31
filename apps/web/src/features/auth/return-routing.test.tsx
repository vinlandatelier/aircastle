import { act, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'
import { createBrowserAuth } from '.'
import {
  displayHttp,
  expectNoShell,
  failure,
  mountAuth,
  ok,
  session,
  submitSignIn,
  submitSetup,
} from './test-support'

describe('Requested destinations over display-only HTTP, without authorization proof', () => {
  it.each(['retained', 'revoked'] as const)(
    '[auth:R4] [auth:R5] carries a protected destination through sign-in with %s access at confirmation',
    async (access) => {
      const requested =
        '/dash/workspaces/123e4567-e89b-42d3-a456-426614174000/projects/123e4567-e89b-42d3-a456-426614174001/collections'
      const returnTo = {
        kind: 'project-page',
        workspaceId: '123e4567-e89b-42d3-a456-426614174000',
        projectId: '123e4567-e89b-42d3-a456-426614174001',
        page: 'collections',
      }
      let authenticated = false
      let membership = true
      const http = displayHttp({
        'GET /api/auth/state': () =>
          ok(authenticated ? { kind: 'authenticated', session } : { kind: 'signed-out' }),
        'GET /api/auth/session': () =>
          authenticated ? ok(session) : failure('unauthenticated', 401),
        'POST /api/auth/activity': () => ok(session),
        'POST /api/auth/sign-in': () => ok({ confirmation: 'sign-in-inbox' }),
        'POST /api/auth/confirm/preview': () =>
          ok({ email: 'alex@example.test', purpose: 'sign-in' }),
        'POST /api/auth/confirm': () => {
          authenticated = true
          return ok({ destination: membership ? returnTo : { kind: 'dashboard' } })
        },
        'POST /api/auth/entry': () => ok({ destination: { kind: 'workspaces' } }),
      })
      const { router, history, user } = await mountAuth(
        `${requested}?callbackURL=https%3A%2F%2Fevil.test&redirect=%2F%2Fevil.test`,
        http,
      )
      expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy()
      expectNoShell()
      await submitSignIn(user, 'alex@example.test')
      expect(
        await screen.findByText(
          'If this account exists, a sign-in link is available in the development inbox.',
          { exact: true },
        ),
      ).toBeTruthy()
      expect(http.calls('/auth/sign-in')).toHaveLength(1)
      expect(await http.calls('/auth/sign-in')[0]!.json()).toEqual({
        email: 'alex@example.test',
        returnTo,
      })

      membership = access === 'retained'
      await act(async () => history.push('/sign-in?token=display-return-link'))
      await user.click(await screen.findByRole('button', { name: 'Continue' }))
      await waitFor(() =>
        expect(router.state.location.pathname).toBe(
          access === 'retained' ? requested : '/dash/workspaces',
        ),
      )
      expect(router.state.location.searchStr).toBe('')
      expect(screen.queryByRole('heading', { name: 'Create a workspace' })).toBeNull()
      if (access === 'retained')
        expect(screen.getByRole('link', { name: 'Collections' }).getAttribute('aria-current')).toBe(
          'page',
        )
      else expect(screen.getByRole('heading', { name: 'Workspaces' })).toBeTruthy()
    },
  )

  describe.each(['setup', 'sign-in'] as const)('%s destination input boundary', (purpose) => {
    it.each([
      '/dash/workspaces/not-a-uuid/projects',
      '/dash/workspaces/not-a-uuid/projects/123e4567-e89b-42d3-a456-426614174001/collections',
      '/dash/workspaces/123e4567-e89b-42d3-a456-426614174000/projects/not-a-uuid/collections',
    ])('[auth:R4] omits malformed return target %s from a valid account request', async (path) => {
      const http = displayHttp({
        'GET /api/auth/state': () =>
          ok({ kind: purpose === 'setup' ? 'setup-required' : 'signed-out' }),
        [`POST /api/auth/${purpose}`]: () => ok({ confirmation: 'inbox' }),
      })
      const { user } = await mountAuth(path, http)
      expectNoShell()
      if (purpose === 'setup') await submitSetup(user, 'Alex', 'alex@example.test')
      else await submitSignIn(user, 'alex@example.test')
      expect(await screen.findByRole('status')).toBeTruthy()
      expect(http.calls(`/auth/${purpose}`)).toHaveLength(1)
      expect(await http.calls(`/auth/${purpose}`)[0]!.json()).toEqual({
        ...(purpose === 'setup' ? { name: 'Alex' } : {}),
        email: 'alex@example.test',
      })
    })

    it.each([
      '/dash/workspaces/%/projects',
      '/dash/workspaces/%E0%A4%A/projects/123e4567-e89b-42d3-a456-426614174001/collections',
      '/dash/workspaces/123e4567-e89b-42d3-a456-426614174000/projects/%/collections',
    ])(
      '[auth:R4] redirects malformed encoding %s to the account screen without retaining it',
      async (path) => {
        const http = displayHttp({
          'GET /api/auth/state': () =>
            ok({ kind: purpose === 'setup' ? 'setup-required' : 'signed-out' }),
        })
        const auth = createBrowserAuth({ fetch: http.fetch })
        await expect(auth.enter(path, {})).rejects.toMatchObject({
          options: { href: purpose === 'setup' ? '/setup' : '/sign-in' },
        })
        expect(auth.returnTo).toBeUndefined()
      },
    )

    it('[auth:R4] retains a valid encoded workspace return target in the account request', async () => {
      const http = displayHttp({
        'GET /api/auth/state': () =>
          ok({ kind: purpose === 'setup' ? 'setup-required' : 'signed-out' }),
        [`POST /api/auth/${purpose}`]: () => ok({ confirmation: 'inbox' }),
      })
      const { user } = await mountAuth(
        '/dash/workspaces/%3123e4567-e89b-42d3-a456-426614174000/projects',
        http,
      )
      if (purpose === 'setup') await submitSetup(user, 'Alex', 'alex@example.test')
      else await submitSignIn(user, 'alex@example.test')
      expect(await screen.findByRole('status')).toBeTruthy()
      expect(http.calls(`/auth/${purpose}`)).toHaveLength(1)
      expect(await http.calls(`/auth/${purpose}`)[0]!.json()).toEqual({
        ...(purpose === 'setup' ? { name: 'Alex' } : {}),
        email: 'alex@example.test',
        returnTo: {
          kind: 'workspace-projects',
          workspaceId: '123e4567-e89b-42d3-a456-426614174000',
        },
      })
    })
  })
})
