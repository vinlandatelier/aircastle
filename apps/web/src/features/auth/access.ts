import type { ProtectedDestination } from './http'

/** What a signed-in visit must prove before a protected route mounts. */
export type Guard =
  | { kind: 'resolve' }
  | { kind: 'session' }
  | { kind: 'visit'; destination: ProtectedDestination }

/**
 * A route's access, declared on the route as `staticData.access` and read from the matched leaf.
 * A protected guard returns `undefined` when the route's params are invalid, which denies the visit.
 */
export type RouteParams = Readonly<{ workspaceId?: string; projectId?: string }>

export type RouteAccess =
  | { kind: 'public' | 'setup' | 'sign-in' | 'inbox' }
  | { kind: 'protected'; guard: (params: RouteParams) => Guard | undefined }

const uuid =
  /^(?:[\dA-Fa-f]{8}-[\dA-Fa-f]{4}-[1-8][\dA-Fa-f]{3}-[89ABab][\dA-Fa-f]{3}-[\dA-Fa-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/

const id = (value: string | undefined) =>
  value !== undefined && uuid.test(value) ? value.toLowerCase() : undefined

const protectedRoute = (guard: (params: RouteParams) => Guard | undefined) =>
  ({ kind: 'protected', guard }) as const satisfies RouteAccess

/** Access declarations for the router's routes. */
export const access = {
  public: { kind: 'public' },
  denied: protectedRoute(() => undefined),
  setup: { kind: 'setup' },
  signIn: { kind: 'sign-in' },
  inbox: { kind: 'inbox' },
  dashboard: protectedRoute(() => ({ kind: 'resolve' })),
  session: protectedRoute(() => ({ kind: 'session' })),
  workspaces: protectedRoute(() => ({ kind: 'visit', destination: { kind: 'workspaces' } })),
  workspaceProjects: protectedRoute((params) => {
    const workspaceId = id(params.workspaceId)
    return workspaceId
      ? { kind: 'visit', destination: { kind: 'workspace-projects', workspaceId } }
      : undefined
  }),
  projectPage: (page: string) =>
    protectedRoute((params) => {
      const workspaceId = id(params.workspaceId)
      const projectId = id(params.projectId)
      return workspaceId && projectId
        ? { kind: 'visit', destination: { kind: 'project-page', workspaceId, projectId, page } }
        : undefined
    }),
} as const satisfies Record<string, RouteAccess | ((page: string) => RouteAccess)>

/**
 * Access for a path that matches no route. Under `/dash`, in any casing, the not-found page needs a
 * session so a signed-out visit goes to sign-in; elsewhere it is public.
 */
export const unmatchedAccess = (pathname: string): RouteAccess =>
  /^\/dash(?:\/|$)/i.test(pathname) ? access.session : access.public
