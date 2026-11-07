import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'
import { displayHttp, ok, renderApp } from '@/test-utils'

describe('Sign in with display-only signed-out HTTP', () => {
  it('opens a standalone Aircastle page without CMS navigation or upstream content', async () => {
    await renderApp('/sign-in', displayHttp())

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Collections' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Toggle Sidebar' })).toBeNull()
    expect(
      screen.queryByText(/Ali Hassan|This Platform|efferd|Enter your email address/i),
    ).toBeNull()
    expect(screen.queryByText(/^OR$/)).toBeNull()
    expect(screen.queryByRole('button', { name: /Google|Apple|GitHub/i })).toBeNull()
  })

  it('accepts email submission through Send sign-in link and stays on the public page', async () => {
    const http = displayHttp({
      'POST /api/auth/sign-in': () => ok({ confirmation: 'sign-in-inbox' }),
    })
    const { router, user } = await renderApp('/sign-in', http)
    const email = screen.getByRole('textbox', { name: 'Email' })
    expect(email.getAttribute('type')).toBe('email')
    expect(email.getAttribute('autocomplete')).toBe('email')
    const button = screen.getByRole('button', { name: 'Send sign-in link' })
    expect(button.hasAttribute('disabled')).toBe(false)

    await user.type(email, 'reader@example.com{Enter}')

    expect(
      await screen.findByText(
        'If this account exists, a sign-in link is available in the development inbox.',
        { exact: true },
      ),
    ).toBeTruthy()
    expect(http.calls('/auth/sign-in')).toHaveLength(1)
    expect(await http.calls('/auth/sign-in')[0]!.json()).toEqual({ email: 'reader@example.com' })
    expect(router.state.location.pathname).toBe('/sign-in')
    expect(screen.getByRole('textbox', { name: 'Email' }).getAttribute('type')).toBe('email')
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeTruthy()
  })

  it('opens the legal destinations in protected new tabs', async () => {
    await renderApp('/sign-in', displayHttp())

    for (const [name, href] of [
      ['Terms of Service', '/terms-of-service'],
      ['Privacy Policy', '/privacy-policy'],
    ] as const) {
      const link = screen.getByRole('link', { name })
      expect(link.getAttribute('href')).toBe(href)
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')?.split(' ')).toEqual(
        expect.arrayContaining(['noopener', 'noreferrer']),
      )
    }
  })

  it('returns Home to the marketing homepage', async () => {
    const { router, user } = await renderApp('/sign-in', displayHttp())
    expect(screen.getByRole('link', { name: 'Home' }).getAttribute('href')).toBe('/')
    await user.click(screen.getByRole('link', { name: 'Home' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(await screen.findByRole('heading', { name: 'Aircastle' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Toggle Sidebar' })).toBeNull()
  })
})
