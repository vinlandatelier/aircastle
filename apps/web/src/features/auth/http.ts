export interface AuthBrowserOptions {
  fetch?: typeof globalThis.fetch
}

export interface BrowserSession {
  user: { id: string; name: string; email: string; authority: 'super_user' }
  expiresAt: number
}

export type Destination =
  | { kind: 'dashboard' }
  | { kind: 'create-workspace' }
  | { kind: 'workspaces' }
  | { kind: 'workspace-projects'; workspaceId: string }
  | { kind: 'project-page'; workspaceId: string; projectId: string; page: string }

export type ProtectedDestination = Exclude<Destination, { kind: 'dashboard' | 'create-workspace' }>
export type HttpResult<Value> =
  | { kind: 'ok'; value: Value }
  | {
      kind:
        | 'temporary-failure'
        | 'unauthenticated'
        | 'forbidden'
        | 'invalid-input'
        | 'email-not-allowed'
        | 'setup-complete'
        | 'setup-required'
    }
  | { kind: 'invalid-link' | 'superseded-link'; next: 'setup' | 'sign-in' }
  | { kind: 'throttled'; retryAt: number }

export function createAuthHttp(options: AuthBrowserOptions) {
  const transport = options.fetch ?? globalThis.fetch.bind(globalThis)
  return async function request<Value>(path: string, body?: object): Promise<HttpResult<Value>> {
    try {
      const response = await transport(`/api${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        ...(body === undefined
          ? {}
          : {
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            }),
      })
      const result: HttpResult<Value> = await response.json()
      return response.ok && result.kind === 'ok'
        ? result
        : result.kind === 'ok'
          ? { kind: 'temporary-failure' }
          : result
    } catch {
      return { kind: 'temporary-failure' }
    }
  }
}

export function destinationPath(destination: Destination): string {
  switch (destination.kind) {
    case 'dashboard':
      return '/dash'
    case 'create-workspace':
      return '/dash/workspaces/new'
    case 'workspaces':
      return '/dash/workspaces'
    case 'workspace-projects':
      return `/dash/workspaces/${encodeURIComponent(destination.workspaceId)}/projects`
    case 'project-page':
      return `/dash/workspaces/${encodeURIComponent(destination.workspaceId)}/projects/${encodeURIComponent(destination.projectId)}/${encodeURIComponent(destination.page)}`
  }
}
