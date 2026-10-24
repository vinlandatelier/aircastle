import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'
import { renderApp } from '@/test-utils'

describe('Sign in', () => {
  it('opens a standalone Aircastle page without CMS navigation or upstream content', async () => {
    await renderApp('/sign-in')

    expect(screen.getByRole('heading', { name: 'Sign in to Aircastle' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Collections' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Toggle Sidebar' })).toBeNull()
    expect(
      screen.queryByText(/Ali Hassan|This Platform|efferd|Enter your email address/i),
    ).toBeNull()
    expect(screen.queryByText(/^OR$/)).toBeNull()
    expect(screen.queryByRole('button', { name: /Google|Apple|GitHub/i })).toBeNull()
  })

  it('keeps email continuation disabled and stays on the page after Enter', async () => {
    const { router, user } = await renderApp('/sign-in')
    const email = screen.getByRole('textbox', { name: 'Email' })
    expect(email.getAttribute('type')).toBe('email')
    expect(email.getAttribute('autocomplete')).toBe('email')
    const button = screen.getByRole('button', { name: 'Continue with email' })
    expect(button.hasAttribute('disabled')).toBe(true)

    await user.type(email, 'reader@example.com{Enter}')
    await user.click(button)

    expect(router.state.location.pathname).toBe('/sign-in')
    expect(screen.getByRole('textbox', { name: 'Email' }).getAttribute('type')).toBe('email')
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Sign in to Aircastle' })).toBeTruthy()
  })

  it('opens the legal destinations in protected new tabs', async () => {
    await renderApp('/sign-in')

    for (const [name, href] of [
      ['Terms of Service', '/terms-of-service'],
      ['Privacy Policy', '/privacy-policy'],
    ]) {
      const link = screen.getByRole('link', { name })
      expect(link.getAttribute('href')).toBe(href)
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')?.split(' ')).toEqual(
        expect.arrayContaining(['noopener', 'noreferrer']),
      )
    }
  })

  it('returns Home to Collections with the CMS shell', async () => {
    const { router, user } = await renderApp('/sign-in')
    expect(screen.getByRole('link', { name: 'Home' }).getAttribute('href')).toBe('/dash')
    await user.click(screen.getByRole('link', { name: 'Home' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/dash/collections'))
    expect(await screen.findByRole('link', { name: 'Collections' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Toggle Sidebar' }).length).toBeGreaterThan(0)
  })
})
