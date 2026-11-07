import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { createAppRouter } from '@/router'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'
import { authenticatedDisplayHttp, renderApp } from '@/test-utils'

describe('App navigation with display-only authenticated HTTP', () => {
  it.each(['tasks', 'collections', 'media', 'analytics', 'users', 'access-tokens', 'settings'])(
    'does not keep the old flat %s destination',
    async (page) => {
      const pathname = `/dash/${page}`
      const router = createAppRouter(createMemoryHistory({ initialEntries: [pathname] }), {
        fetch: authenticatedDisplayHttp().fetch,
      })
      await router.load()
      expect(router.state.location.pathname).toBe(pathname)
      render(<RouterProvider router={router} />)
      expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeTruthy()
      expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull()
    },
  )

  it.each([
    '/dash/workspaces/33333333-3333-4333-8333-333333333333/projects/44444444-4444-4444-8444-444444444444',
    '/dash/workspaces/55555555-5555-4555-8555-555555555555/projects/66666666-6666-4666-8666-666666666666',
  ])('redirects project base %s within its scope', async (base) => {
    const { router } = await renderApp(base)
    expect(router.state.location.pathname).toBe(`${base}/collections`)
    expect(router.history.length).toBe(1)
  })

  it('keeps the brand link within the current project', async () => {
    const { router, user } = await renderApp(
      '/dash/workspaces/33333333-3333-4333-8333-333333333333/projects/44444444-4444-4444-8444-444444444444/settings',
    )
    await user.click(screen.getByRole('link', { name: 'Aircastle' }))
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        '/dash/workspaces/33333333-3333-4333-8333-333333333333/projects/44444444-4444-4444-8444-444444444444/collections',
      ),
    )
  })

  it.each(['/dash'])('routes authenticated %s through the workspace entry', async (path) => {
    const { router } = await renderApp(path)
    expect(await screen.findByRole('heading', { name: 'Workspaces' })).toBeTruthy()
    expect(router.state.location.pathname).toBe('/dash/workspaces')
    expect(router.history.length).toBe(1)
  })

  it('opens the requested Collections page and marks it current', async () => {
    const { router } = await renderApp(
      '/dash/workspaces/11111111-1111-4111-8111-111111111111/projects/22222222-2222-4222-8222-222222222222/collections',
    )

    expect(router.state.location.pathname).toBe(
      '/dash/workspaces/11111111-1111-4111-8111-111111111111/projects/22222222-2222-4222-8222-222222222222/collections',
    )
    expect(router.history.length).toBe(1)
    expect(screen.getByRole('link', { name: 'Collections' }).getAttribute('aria-current')).toBe(
      'page',
    )
  })

  it('navigates through the sidebar and follows browser history', async () => {
    const { router, user } = await renderApp(
      '/dash/workspaces/33333333-3333-4333-8333-333333333333/projects/44444444-4444-4444-8444-444444444444/collections',
    )

    await user.click(screen.getByRole('link', { name: 'Tasks' }))
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        '/dash/workspaces/33333333-3333-4333-8333-333333333333/projects/44444444-4444-4444-8444-444444444444/tasks',
      ),
    )
    expect(screen.getByRole('link', { name: 'Tasks' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'Collections' }).hasAttribute('aria-current')).toBe(
      false,
    )

    await user.click(screen.getByRole('link', { name: 'Media Library' }))
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        '/dash/workspaces/33333333-3333-4333-8333-333333333333/projects/44444444-4444-4444-8444-444444444444/media',
      ),
    )

    await act(async () => router.history.back())
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        '/dash/workspaces/33333333-3333-4333-8333-333333333333/projects/44444444-4444-4444-8444-444444444444/tasks',
      ),
    )
    expect(screen.getByRole('link', { name: 'Tasks' }).getAttribute('aria-current')).toBe('page')

    await act(async () => router.history.forward())
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        '/dash/workspaces/33333333-3333-4333-8333-333333333333/projects/44444444-4444-4444-8444-444444444444/media',
      ),
    )
  })

  it('navigates from keyboard search and dismisses the dialog', async () => {
    const { router, user } = await renderApp(
      '/dash/workspaces/55555555-5555-4555-8555-555555555555/projects/66666666-6666-4666-8666-666666666666/collections',
    )

    await user.keyboard('{Control>}k{/Control}')
    const dialog = await screen.findByRole('dialog', { name: 'Search pages' })
    const input = within(dialog).getByRole('combobox', { name: 'Pages' })
    await user.type(input, 'Users')
    await user.keyboard('{Enter}')

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        '/dash/workspaces/55555555-5555-4555-8555-555555555555/projects/66666666-6666-4666-8666-666666666666/users',
      ),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('link', { name: 'Users' }).getAttribute('aria-current')).toBe('page')
  })

  it('supports direct destinations and keeps sidebar state during navigation', async () => {
    const { router, user } = await renderApp(
      '/dash/workspaces/55555555-5555-4555-8555-555555555555/projects/66666666-6666-4666-8666-666666666666/settings',
    )
    expect(screen.getByRole('link', { name: 'Settings' }).getAttribute('aria-current')).toBe('page')
    const trigger = screen.getAllByRole('button', { name: 'Toggle Sidebar' })[0]!
    await user.click(trigger)

    await user.click(screen.getByRole('link', { name: 'Tasks' }))

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        '/dash/workspaces/55555555-5555-4555-8555-555555555555/projects/66666666-6666-4666-8666-666666666666/tasks',
      ),
    )
    expect(
      screen.getAllByRole('button', { name: 'Toggle Sidebar' })[0]!.getAttribute('aria-expanded'),
    ).toBe('false')
  })
})
