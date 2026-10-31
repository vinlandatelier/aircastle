import { redirect } from '@tanstack/react-router'
import { navigationPages } from '@/features/navigation'
import {
  createAuthHttp,
  destinationPath,
  type AuthBrowserOptions,
  type BrowserSession,
  type Destination,
  type HttpResult,
  type ProtectedDestination,
} from './http'

export type Confirmation = {
  purpose: 'setup' | 'sign-in'
  token: string
  preview: HttpResult<{ email: string; purpose: 'setup' | 'sign-in' }>
}
type InstanceState =
  | { kind: 'setup-required' | 'signed-out' | 'disabled' }
  | { kind: 'authenticated'; session: BrowserSession }

export type AuthView =
  | { kind: 'public' }
  | { kind: 'authenticated'; session: BrowserSession }
  | { kind: 'disabled' }
  | { kind: 'failure' }

const uuid =
  /^(?:[\dA-Fa-f]{8}-[\dA-Fa-f]{4}-[1-8][\dA-Fa-f]{3}-[89ABab][\dA-Fa-f]{3}-[\dA-Fa-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/

function protectedDestination(path: string): ProtectedDestination | undefined {
  if (path === '/dash/workspaces') return { kind: 'workspaces' }
  try {
    const [, projectsWorkspace] = /^\/dash\/workspaces\/([^/]+)\/projects$/.exec(path) ?? []
    if (projectsWorkspace !== undefined) {
      const workspaceId = decodeURIComponent(projectsWorkspace)
      if (uuid.test(workspaceId)) return { kind: 'workspace-projects', workspaceId }
    }
    const [, pageWorkspace, pageProject, page] =
      /^\/dash\/workspaces\/([^/]+)\/projects\/([^/]+)\/([^/]+)$/.exec(path) ?? []
    if (
      pageWorkspace !== undefined &&
      pageProject !== undefined &&
      page !== undefined &&
      navigationPages.some((item) => item.path.endsWith(`/${page}`))
    ) {
      const workspaceId = decodeURIComponent(pageWorkspace)
      const projectId = decodeURIComponent(pageProject)
      if (uuid.test(workspaceId) && uuid.test(projectId)) {
        return { kind: 'project-page', workspaceId, projectId, page }
      }
    }
  } catch (error) {
    if (!(error instanceof URIError)) throw error
    return undefined
  }
}

export function createBrowserAuth(options: AuthBrowserOptions = {}) {
  const request = createAuthHttp(options)
  let requested: ProtectedDestination | undefined
  let confirmation: Confirmation | undefined
  let handoff: { path: string; state: InstanceState } | undefined
  const go = (path: string): never => {
    throw redirect({ href: path, replace: true })
  }
  const signedOut = (): never => {
    handoff = { path: '/sign-in', state: { kind: 'signed-out' } }
    return go('/sign-in')
  }
  return {
    request,
    get returnTo() {
      return requested
    },
    get confirmation() {
      return confirmation
    },
    clearConfirmation() {
      confirmation = undefined
    },
    async entry(body: object) {
      return request<{ destination: Destination }>('/auth/entry', body)
    },
    async enter(path: string, search: Record<string, unknown>): Promise<AuthView> {
      if (
        path !== '/dash' &&
        !path.startsWith('/dash/') &&
        path !== '/setup' &&
        path !== '/sign-in' &&
        path !== '/development-inbox'
      ) {
        return { kind: 'public' }
      }
      const purpose = path === '/setup' ? 'setup' : path === '/sign-in' ? 'sign-in' : undefined
      const token = typeof search.token === 'string' && search.token ? search.token : undefined
      if (purpose && !token && confirmation?.purpose === purpose) return { kind: 'public' }
      const state: HttpResult<InstanceState> =
        handoff?.path === path
          ? { kind: 'ok', value: handoff.state }
          : await request<InstanceState>('/auth/state')
      handoff = undefined
      if (state.kind !== 'ok') return { kind: 'failure' }
      if (state.value.kind === 'disabled') {
        confirmation = undefined
        return { kind: 'disabled' }
      }
      if (purpose && token) {
        confirmation = {
          purpose,
          token,
          preview: await request('/auth/confirm/preview', { purpose, token }),
        }
        go(path)
      }
      confirmation = undefined
      if (path === '/development-inbox') {
        if (state.value.kind === 'authenticated') await request('/auth/activity', {})
        return { kind: 'public' }
      }
      if (state.value.kind !== 'authenticated') {
        requested = protectedDestination(path) ?? requested
        const target = state.value.kind === 'setup-required' ? '/setup' : '/sign-in'
        if (path !== target) {
          handoff = { path: target, state: state.value }
          go(target)
        }
        return { kind: 'public' }
      }
      const session = await request<BrowserSession>('/auth/session')
      if (session.kind === 'unauthenticated') signedOut()
      if (session.kind !== 'ok') return { kind: 'failure' }
      const activity = await request<BrowserSession>('/auth/activity', {})
      if (activity.kind === 'unauthenticated') signedOut()
      if (activity.kind !== 'ok') return { kind: 'failure' }
      if (path === '/setup' || path === '/sign-in') go('/dash')
      if (path === '/dash' || path === '/dash/') {
        const entry = await request<{ destination: Destination }>('/auth/entry', {
          kind: 'resolve',
        })
        if (entry.kind === 'unauthenticated') signedOut()
        if (entry.kind !== 'ok') return { kind: 'failure' }
        requested = undefined
        go(destinationPath(entry.value.destination))
      }
      const destination = protectedDestination(path)
      if (destination) {
        const entry = await request<{ destination: Destination }>('/auth/entry', {
          kind: 'visit',
          destination,
        })
        if (entry.kind === 'unauthenticated') signedOut()
        if (entry.kind === 'forbidden') go('/dash')
        if (entry.kind !== 'ok') return { kind: 'failure' }
      }
      return { kind: 'authenticated', session: activity.value }
    },
  }
}

export type BrowserAuth = ReturnType<typeof createBrowserAuth>
