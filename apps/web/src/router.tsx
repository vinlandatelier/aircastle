import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Link,
  redirect,
  type RouterHistory,
} from '@tanstack/react-router'
import { NotFoundPage } from '@/features/not-found'
import { SignInPage } from '@/features/sign-in'
import { DashboardSkeleton } from '@/components/dashboard-skeleton'
import { navigationPages } from '@/features/navigation'
import { landingDescription, landingTitle } from '@/metadata'
import {
  access,
  unmatchedAccess,
  AuthRoot,
  DashboardLayout,
  Workspaces,
  createBrowserAuth,
  DevelopmentInbox,
  type AuthBrowserOptions,
  type BrowserAuth,
  type RouteAccess,
} from '@/features/auth'

const rootRoute = createRootRouteWithContext<{ auth: BrowserAuth }>()({
  beforeLoad: async ({ context, location, matches }) => {
    const leaf = matches.at(-1)
    const notFound = matches.some((match) => match._notFound)
    return {
      view: await context.auth.enter(
        {
          access: notFound
            ? unmatchedAccess(location.pathname)
            : (leaf?.staticData.access ?? access.denied),
          params: leaf?.params ?? {},
        },
        location.pathname,
        location.search,
      ),
    }
  },
  component: AuthRoot,
  notFoundComponent: NotFoundPage,
  head: () => ({
    meta: [
      {
        name: 'description',
        content: landingDescription,
      },
    ],
  }),
  pendingComponent: () => (
    <main role="status" className="p-8">
      Loading…
    </main>
  ),
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  staticData: { access: access.public },
  head: () => ({
    meta: [{ title: landingTitle }],
  }),
  component: () => (
    <main
      data-theme-scope="marketing"
      className="flex min-h-svh flex-col items-center justify-center gap-6 p-8"
    >
      <span aria-hidden="true" className="brand-logo block size-10" />
      <h1 className="text-2xl font-semibold">Aircastle</h1>
      <Link to="/sign-in" className="text-sm underline underline-offset-4">
        Sign in
      </Link>
    </main>
  ),
})
const dashboardEntryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dash',
  staticData: { access: access.dashboard },
})
const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/setup',
  staticData: { access: access.setup },
  component: () => <SignInPage purpose="setup" />,
})
const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-in',
  staticData: { access: access.signIn },
  component: SignInPage,
  head: () => ({ meta: [{ title: 'Aircastle - Sign in' }] }),
})
const inboxRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/development-inbox',
  staticData: { access: access.inbox },
  component: DevelopmentInbox,
})
const workspacesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dash/workspaces',
  staticData: { access: access.workspaces },
  component: () => <Workspaces title="Workspaces" />,
})
const createWorkspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dash/workspaces/new',
  staticData: { access: access.session },
  component: () => <Workspaces title="Create a workspace" />,
})
const projectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dash/workspaces/$workspaceId/projects',
  staticData: { access: access.workspaceProjects },
  component: () => <Workspaces title="Projects" />,
})
const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dash/workspaces/$workspaceId/projects/$projectId',
  staticData: { access: access.projectPage('collections') },
  component: DashboardLayout,
})
const dashboardIndexRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: '/',
  staticData: { access: access.projectPage('collections') },
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/dash/workspaces/$workspaceId/projects/$projectId/collections',
      params,
      replace: true,
    })
  },
})

type DashboardPagePath =
  (typeof navigationPages)[number]['path'] extends `/dash/workspaces/$workspaceId/projects/$projectId/${infer Path}`
    ? Path
    : never
const pageRoutes = navigationPages.map(({ path, title }) =>
  createRoute({
    getParentRoute: () => dashboardRoute,
    path: path.replace(
      '/dash/workspaces/$workspaceId/projects/$projectId/',
      '',
    ) as DashboardPagePath,
    staticData: { access: access.projectPage(path.split('/').at(-1) ?? '') },
    component: DashboardSkeleton,
    head: () => ({ meta: [{ title: `Aircastle - ${title}` }] }),
  }),
)
const routeTree = rootRoute.addChildren([
  indexRoute,
  dashboardEntryRoute,
  setupRoute,
  signInRoute,
  inboxRoute,
  workspacesRoute,
  createWorkspaceRoute,
  projectsRoute,
  dashboardRoute.addChildren([dashboardIndexRoute, ...pageRoutes]),
])

export function createAppRouter(history: RouterHistory, options?: AuthBrowserOptions) {
  const auth = createBrowserAuth(options)
  const router = createRouter({
    routeTree,
    history,
    notFoundMode: 'root',
    disableGlobalCatchBoundary: true,
    context: { auth },
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
    defaultPreload: false,
  })
  router.subscribe('onResolved', () => auth.settle())
  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
  interface StaticDataRouteOption {
    access?: RouteAccess
  }
}
