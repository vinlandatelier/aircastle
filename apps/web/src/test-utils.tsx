import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { createAppRouter } from './router'
import { vi } from 'vite-plus/test'

const protectedPath = '/dash/workspaces/demo/projects/demo/collections'
const session = {
  user: {
    id: 'shell-display-user',
    name: 'Shell Test User',
    email: 'shell@example.test',
    authority: 'super_user',
  },
  expiresAt: Date.UTC(2030, 0, 15),
}

export function ok(value: unknown) {
  return Response.json({ kind: 'ok', value })
}

export function displayHttp(
  routes: Record<string, (request: Request) => Response | Promise<Response>> = {},
) {
  const requests: Request[] = []
  const handlers: Record<string, (request: Request) => Response | Promise<Response>> = {
    'GET /api/auth/state': () => ok({ kind: 'signed-out' }),
    'GET /api/auth/session': () => Response.json({ kind: 'unauthenticated' }, { status: 401 }),
    ...routes,
  }
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(
      input instanceof Request ? input : new URL(input, window.location.href),
      init,
    )
    requests.push(request.clone())
    const handler = handlers[`${request.method} ${new URL(request.url).pathname}`]
    return handler
      ? handler(request.clone())
      : Response.json({ kind: 'temporary-failure' }, { status: 503 })
  })
  const calls = (path: string) =>
    requests.filter(
      (request) => request.method === 'POST' && new URL(request.url).pathname === `/api${path}`,
    )
  return { fetch, calls }
}

export function authenticatedDisplayHttp() {
  return displayHttp({
    'GET /api/auth/state': () => ok({ kind: 'authenticated', session }),
    'GET /api/auth/session': () => ok(session),
    'POST /api/auth/activity': () => ok(session),
    'POST /api/auth/entry': async (request) => {
      const entry = await request.json()
      return ok({
        destination: entry.kind === 'visit' ? entry.destination : { kind: 'workspaces' },
      })
    },
  })
}

export async function renderApp(path = protectedPath, http = authenticatedDisplayHttp()) {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }), {
    fetch: http.fetch,
  })
  await act(async () => {
    await router.load()
    render(<RouterProvider router={router} />)
  })
  await screen.findByRole('main')
  return { router, user: userEvent.setup() }
}
