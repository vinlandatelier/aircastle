import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createBrowserHistory } from '@tanstack/react-router'
import { AppErrorBoundary } from '../src/features/error-recovery'
import { createAppRouter } from '../src/router'
import { shellData } from './fixtures'
import '../src/index.css'

const { user } = shellData(new URLSearchParams(location.search).get('scenario'))
const session = {
  user: { ...user, id: 'display-only-shell-user', authority: 'super_user' },
  expiresAt: Date.UTC(2030, 0, 15),
}
const responses: Record<string, unknown> = {
  'GET /api/auth/session': session,
  'POST /api/auth/activity': session,
  'POST /api/auth/entry': {
    destination: {
      kind: 'project-page',
      workspaceId: 'demo',
      projectId: 'demo',
      page: 'collections',
    },
  },
}
const displayOnlyFetch: typeof globalThis.fetch = async (input, init) => {
  const request = new Request(
    input instanceof Request ? input : new URL(input, location.href),
    init,
  )
  const key = `${request.method} ${new URL(request.url).pathname}`
  if (key === 'GET /api/auth/state')
    return Response.json({
      kind: 'ok',
      value:
        location.pathname === '/sign-in'
          ? { kind: 'signed-out' }
          : { kind: 'authenticated', session },
    })
  if (!Object.hasOwn(responses, key))
    return Response.json({ kind: 'temporary-failure' }, { status: 503 })
  if (key === 'POST /api/auth/entry') {
    const entry = await request.json()
    return Response.json({
      kind: 'ok',
      value: {
        destination:
          entry.kind === 'visit'
            ? entry.destination
            : { kind: 'project-page', workspaceId: 'demo', projectId: 'demo', page: 'collections' },
      },
    })
  }
  return Response.json({ kind: 'ok', value: responses[key] })
}
const router = createAppRouter(createBrowserHistory(), { fetch: displayOnlyFetch })

document
  .querySelectorAll('head > title, head > meta[name="description"]')
  .forEach((element) => element.remove())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <RouterProvider router={router} />
    </AppErrorBoundary>
  </StrictMode>,
)
