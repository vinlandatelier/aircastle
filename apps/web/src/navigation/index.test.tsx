import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'
import { renderApp } from '../test-utils'

describe('App navigation', () => {
  it('opens Collections by default and marks the current page', async () => {
    const { router } = await renderApp()

    expect(router.state.location.pathname).toBe('/collections')
    expect(screen.getByRole('link', { name: 'Collections' }).getAttribute('aria-current')).toBe(
      'page',
    )
  })

  it('navigates through the sidebar and follows browser history', async () => {
    const { router, user } = await renderApp()

    await user.click(screen.getByRole('link', { name: 'Tasks' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/tasks'))
    expect(screen.getByRole('link', { name: 'Tasks' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'Collections' }).hasAttribute('aria-current')).toBe(
      false,
    )

    await user.click(screen.getByRole('link', { name: 'Media Library' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/media'))

    await act(async () => router.history.back())
    await waitFor(() => expect(router.state.location.pathname).toBe('/tasks'))
    expect(screen.getByRole('link', { name: 'Tasks' }).getAttribute('aria-current')).toBe('page')

    await act(async () => router.history.forward())
    await waitFor(() => expect(router.state.location.pathname).toBe('/media'))
  })

  it('navigates from keyboard search and dismisses the dialog', async () => {
    const { router, user } = await renderApp()

    await user.keyboard('{Control>}k{/Control}')
    const dialog = await screen.findByRole('dialog', { name: 'Search pages' })
    const input = within(dialog).getByRole('combobox', { name: 'Pages' })
    await user.type(input, 'Users')
    await user.keyboard('{Enter}')

    await waitFor(() => expect(router.state.location.pathname).toBe('/users'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('link', { name: 'Users' }).getAttribute('aria-current')).toBe('page')
  })

  it('supports direct destinations and keeps sidebar state during navigation', async () => {
    const { router, user } = await renderApp('/settings')
    expect(screen.getByRole('link', { name: 'Settings' }).getAttribute('aria-current')).toBe('page')
    const trigger = screen.getAllByRole('button', { name: 'Toggle Sidebar' })[0]!
    await user.click(trigger)

    await user.click(screen.getByRole('link', { name: 'Tasks' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/tasks'))
    expect(
      screen.getAllByRole('button', { name: 'Toggle Sidebar' })[0]!.getAttribute('aria-expanded'),
    ).toBe('false')
  })
})
