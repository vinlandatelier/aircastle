import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'
import { displayHttp, expectNoShell, failure, mountAuth, ok, session } from './test-support'

describe('Public routing independent of authentication', () => {
  it.each([
    ['disabled', () => ok({ kind: 'disabled' })],
    ['setup required', () => ok({ kind: 'setup-required' })],
    ['signed out', () => ok({ kind: 'signed-out' })],
    ['authenticated', () => ok({ kind: 'authenticated', session })],
    ['unavailable', () => failure('temporary-failure')],
  ] as const)('keeps the landing page public when authentication is %s', async (_, state) => {
    const http = displayHttp({ 'GET /api/auth/state': state })
    const { router } = await mountAuth('/', http)

    expect(await screen.findByRole('heading', { name: 'Aircastle' })).toBeTruthy()
    expect(router.state.location.pathname).toBe('/')
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/sign-in')
    expect(http.requests).toHaveLength(0)
    expectNoShell()
  })

  it.each(['/privacy-policy', '/terms-of-service', '/not-a-page'])(
    'shows a public not-found page for unimplemented %s without an auth request',
    async (path) => {
      const http = displayHttp({ 'GET /api/auth/state': () => ok({ kind: 'disabled' }) })
      const { router } = await mountAuth(path, http)

      expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeTruthy()
      expect(router.state.location.pathname).toBe(path)
      expect(http.requests).toHaveLength(0)
      expectNoShell()
    },
  )
})
