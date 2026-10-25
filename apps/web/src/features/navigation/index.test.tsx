import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { createAppRouter } from '@/router'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'
import { renderApp } from '@/test-utils'

describe('App navigation', () => {
  it.each(['tasks', 'collections', 'media', 'analytics', 'users', 'access-tokens', 'settings'])(
    'does not keep the old flat %s destination',
    async (page) => {
      const pathname = `/dash/${page}`
      const router = createAppRouter(createMemoryHistory({ initialEntries: [pathname] }))
      await router.load()
      expect(router.state.location.pathname).toBe(pathname)
      render(<RouterProvider router={router} />)
      expect(await screen.findByText('Not Found')).toBeTruthy()
      expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull()
    },
  )

  it.each([
    '/dash/workspaces/acme/projects/editorial',
    '/dash/workspaces/team-42/projects/site_beta',
  ])('redirects project base %s within its scope', async (base) => {
    const { router } = await renderApp(base)
    expect(router.state.location.pathname).toBe(`${base}/collections`)
    expect(router.history.length).toBe(1)
  })

  it('keeps the brand link within the current project', async () => {
    const { router, user } = await renderApp('/dash/workspaces/acme/projects/editorial/settings')
    await user.click(screen.getByRole('link', { name: 'Aircastle' }))
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        '/dash/workspaces/acme/projects/editorial/collections',
      ),
    )
  })

  it('redirects the dashboard index to Collections', async () => {
    const { router } = await renderApp('/dash')
    expect(router.state.location.pathname).toBe('/dash/workspaces/demo/projects/demo/collections')
    expect(router.history.length).toBe(1)
    expect(screen.getByRole('link', { name: 'Aircastle' }).getAttribute('href')).toBe(
      '/dash/workspaces/demo/projects/demo/collections',
    )
  })

  it('opens Collections by default and marks the current page', async () => {
    const { router } = await renderApp()

    expect(router.state.location.pathname).toBe('/dash/workspaces/demo/projects/demo/collections')
    expect(router.history.length).toBe(1)
    expect(screen.getByRole('link', { name: 'Collections' }).getAttribute('aria-current')).toBe(
      'page',
    )
  })

  it('navigates through the sidebar and follows browser history', async () => {
    const { router, user } = await renderApp('/dash/workspaces/acme/projects/editorial/collections')

    await user.click(screen.getByRole('link', { name: 'Tasks' }))
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/dash/workspaces/acme/projects/editorial/tasks'),
    )
    expect(screen.getByRole('link', { name: 'Tasks' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'Collections' }).hasAttribute('aria-current')).toBe(
      false,
    )

    await user.click(screen.getByRole('link', { name: 'Media Library' }))
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/dash/workspaces/acme/projects/editorial/media'),
    )

    await act(async () => router.history.back())
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/dash/workspaces/acme/projects/editorial/tasks'),
    )
    expect(screen.getByRole('link', { name: 'Tasks' }).getAttribute('aria-current')).toBe('page')

    await act(async () => router.history.forward())
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/dash/workspaces/acme/projects/editorial/media'),
    )
  })

  it('navigates from keyboard search and dismisses the dialog', async () => {
    const { router, user } = await renderApp(
      '/dash/workspaces/team-42/projects/site_beta/collections',
    )

    await user.keyboard('{Control>}k{/Control}')
    const dialog = await screen.findByRole('dialog', { name: 'Search pages' })
    const input = within(dialog).getByRole('combobox', { name: 'Pages' })
    await user.type(input, 'Users')
    await user.keyboard('{Enter}')

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        '/dash/workspaces/team-42/projects/site_beta/users',
      ),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('link', { name: 'Users' }).getAttribute('aria-current')).toBe('page')
  })

  it('supports direct destinations and keeps sidebar state during navigation', async () => {
    const { router, user } = await renderApp('/dash/workspaces/team-42/projects/site_beta/settings')
    expect(screen.getByRole('link', { name: 'Settings' }).getAttribute('aria-current')).toBe('page')
    const trigger = screen.getAllByRole('button', { name: 'Toggle Sidebar' })[0]!
    await user.click(trigger)

    await user.click(screen.getByRole('link', { name: 'Tasks' }))

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        '/dash/workspaces/team-42/projects/site_beta/tasks',
      ),
    )
    expect(
      screen.getAllByRole('button', { name: 'Toggle Sidebar' })[0]!.getAttribute('aria-expanded'),
    ).toBe('false')
  })
})
