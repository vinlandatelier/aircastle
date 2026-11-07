import { redirect } from '@tanstack/react-router'
import type { RouteAccess, RouteParams } from './access'
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

export function createBrowserAuth(options: AuthBrowserOptions = {}) {
  const request = createAuthHttp(options)
  let requested: ProtectedDestination | undefined
  let confirmation: Confirmation | undefined
  let handoff:
    | { path: string; state: InstanceState }
    | { path: string; view: Extract<AuthView, { kind: 'authenticated' }> }
    | undefined
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
      return request<{ destination: Destination; session: BrowserSession }>('/auth/entry', body)
    },
    async enter(
      route: { access: RouteAccess; params: RouteParams },
      path: string,
      search: Record<string, unknown>,
    ): Promise<AuthView> {
      const { access } = route
      if (access.kind === 'public') return { kind: 'public' }
      const purpose =
        access.kind === 'setup' ? 'setup' : access.kind === 'sign-in' ? 'sign-in' : undefined
      const token = typeof search.token === 'string' && search.token ? search.token : undefined
      if (purpose && !token && confirmation?.purpose === purpose) return { kind: 'public' }
      const handed = handoff?.path === path ? handoff : undefined
      handoff = undefined
      if (handed && 'view' in handed) return handed.view
      const state: HttpResult<InstanceState> = handed
        ? { kind: 'ok', value: handed.state }
        : await request<InstanceState>('/auth/state')
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
      if (access.kind === 'inbox') {
        if (state.value.kind === 'authenticated') await request('/auth/activity', {})
        return { kind: 'public' }
      }
      const guard = access.kind === 'protected' ? access.guard(route.params) : undefined
      if (state.value.kind !== 'authenticated') {
        requested = guard?.kind === 'visit' ? guard.destination : requested
        const target = state.value.kind === 'setup-required' ? '/setup' : '/sign-in'
        if (path !== target) {
          handoff = { path: target, state: state.value }
          go(target)
        }
        return { kind: 'public' }
      }
      const authenticated = state.value
      const toDashboard = (): never => {
        handoff = { path: '/dash', state: authenticated }
        return go('/dash')
      }
      if (!guard) return toDashboard()
      if (guard.kind === 'session') {
        const activity = await request<BrowserSession>('/auth/activity', {})
        if (activity.kind === 'unauthenticated') signedOut()
        if (activity.kind !== 'ok') return { kind: 'failure' }
        return { kind: 'authenticated', session: activity.value }
      }
      const entry = await request<{ destination: Destination; session: BrowserSession }>(
        '/auth/entry',
        guard.kind === 'resolve'
          ? { kind: 'resolve' }
          : { kind: 'visit', destination: guard.destination },
      )
      if (entry.kind === 'unauthenticated') signedOut()
      if (entry.kind === 'forbidden') toDashboard()
      if (entry.kind !== 'ok') return { kind: 'failure' }
      const view = { kind: 'authenticated', session: entry.value.session } as const
      if (guard.kind === 'resolve') {
        requested = undefined
        const next = destinationPath(entry.value.destination)
        handoff = { path: next, view }
        go(next)
      }
      return view
    },
  }
}

export type BrowserAuth = ReturnType<typeof createBrowserAuth>
