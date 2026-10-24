import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  Link,
  redirect,
  type RouterHistory,
  type ErrorComponentProps,
} from '@tanstack/react-router'
import App from './App'
import { AppShell } from '@/components/shell'
import { SignInPage } from '@/features/sign-in'
import { NotFoundPage } from '@/features/not-found'
import { DashboardSkeleton } from '@/components/dashboard-skeleton'
import { navigationPages } from '@/features/navigation'

const rootRoute = createRootRoute({
  component: App,
  errorComponent: ({ error }: ErrorComponentProps): never => {
    throw error
  },
  notFoundComponent: NotFoundPage,
  head: () => ({
    meta: [
      {
        name: 'description',
        content:
          'Aircastle is a code-first, headless CMS with agentic capabilities designed to automate the slow, manual parts of managing written content.',
      },
    ],
  }),
})
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  head: () => ({
    meta: [{ title: 'Aircastle: The Headless CMS with Next-Generation Agentic Capabilities' }],
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
const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dash/workspaces/$workspaceId/projects/$projectId',
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
})
const dashboardEntryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dash',
})
const dashboardEntryIndexRoute = createRoute({
  getParentRoute: () => dashboardEntryRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({
      to: '/dash/workspaces/$workspaceId/projects/$projectId/collections',
      params: { workspaceId: 'demo', projectId: 'demo' },
      replace: true,
    })
  },
})
const dashboardIndexRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: '/',
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/dash/workspaces/$workspaceId/projects/$projectId/collections',
      params,
      replace: true,
    })
  },
})
const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-in',
  component: SignInPage,
  head: () => ({ meta: [{ title: 'Aircastle - Sign in' }] }),
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
    component: DashboardSkeleton,
    head: () => ({ meta: [{ title: `Aircastle - ${title}` }] }),
  }),
)
const routeTree = rootRoute.addChildren([
  indexRoute,
  signInRoute,
  dashboardEntryRoute.addChildren([dashboardEntryIndexRoute]),
  dashboardRoute.addChildren([dashboardIndexRoute, ...pageRoutes]),
])

export function createAppRouter(history?: RouterHistory) {
  return createRouter({
    routeTree,
    history,
    notFoundMode: 'root',
    disableGlobalCatchBoundary: true,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
