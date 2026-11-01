import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { expect, vi } from 'vite-plus/test'
import { createAppRouter } from '@/router'

export const protectedPath = '/dash/workspaces/demo/projects/demo/collections'
export const session = {
  user: {
    id: 'display-user',
    name: 'Alex Example',
    email: 'alex@example.test',
    authority: 'super_user',
  },
  expiresAt: Date.UTC(2030, 0, 15),
}

export function ok(value: unknown) {
  return Response.json({ kind: 'ok', value })
}

export function failure(kind: string, status = 503, fields: object = {}) {
  return Response.json({ kind, ...fields }, { status })
}

export function deferredResponse() {
  let resolve!: (response: Response) => void
  const promise = new Promise<Response>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

export function displayHttp(routes: Record<string, () => Response | Promise<Response>> = {}) {
  const requests: Request[] = []
  const handlers: Record<string, () => Response | Promise<Response>> = {
    'GET /api/auth/state': () => ok({ kind: 'signed-out' }),
    'GET /api/auth/session': () => failure('unauthenticated', 401),
    ...routes,
  }
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(
      input instanceof Request ? input : new URL(input, window.location.href),
      init,
    )
    requests.push(request.clone())
    const handler = handlers[`${request.method} ${new URL(request.url).pathname}`]
    return handler ? handler() : failure('temporary-failure')
  })
  function calls(path: string, method = 'POST') {
    return requests.filter(
      (request) => request.method === method && new URL(request.url).pathname === `/api${path}`,
    )
  }
  return { fetch, calls, requests }
}

export async function mountAuth(path: string, http: ReturnType<typeof displayHttp>) {
  const history = createMemoryHistory({ initialEntries: [path] })
  const router = createAppRouter(history, { fetch: http.fetch })
  await act(async () => {
    render(<RouterProvider router={router} />)
  })
  return { router, history, user: userEvent.setup() }
}

export async function submitSetup(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
  email: string,
) {
  const nameField = await screen.findByRole('textbox', { name: /name/i })
  const emailField = screen.getByRole('textbox', { name: /email/i })
  if (name) await user.type(nameField, name)
  if (email) await user.type(emailField, email)
  await user.click(screen.getByRole('button', { name: /send.*link|create.*account|continue/i }))
}

export async function submitSignIn(user: ReturnType<typeof userEvent.setup>, email: string) {
  const emailField = await screen.findByRole('textbox', { name: 'Email' })
  if (email) await user.type(emailField, email)
  await user.keyboard('{Enter}')
}

export async function expectFieldError(field: HTMLElement) {
  await waitFor(() => expect(field.getAttribute('aria-invalid')).toBe('true'))
  const references = [
    ...(field.getAttribute('aria-describedby')?.split(/\s+/) ?? []),
    ...(field.getAttribute('aria-errormessage')?.split(/\s+/) ?? []),
  ]
  expect(references.length).toBeGreaterThan(0)
  expect(references.some((id) => document.getElementById(id)?.textContent?.trim())).toBe(true)
}

export function expectNoShell() {
  expect(screen.queryByRole('button', { name: 'Open account menu' })).toBeNull()
  expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull()
  expect(screen.queryByRole('link', { name: 'Collections' })).toBeNull()
}
