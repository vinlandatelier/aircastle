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
    ] as const) {
      const link = screen.getByRole('link', { name })
      expect(link.getAttribute('href')).toBe(href)
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')?.split(' ')).toEqual(
        expect.arrayContaining(['noopener', 'noreferrer']),
      )
    }
  })

  it('has no Home button, and the logo above the heading returns to the marketing homepage', async () => {
    const { router, user } = await renderApp('/sign-in')
    expect(screen.queryByRole('link', { name: 'Home' })).toBeNull()
    const logo = screen.getByRole('link', { name: 'Aircastle home' })
    expect(logo.getAttribute('href')).toBe('/')
    expect(
      logo.compareDocumentPosition(screen.getByRole('heading', { name: 'Sign in to Aircastle' })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    await user.click(logo)

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(await screen.findByRole('navigation', { name: 'Marketing navigation' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Toggle Sidebar' })).toBeNull()
  })
})
