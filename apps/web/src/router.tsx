import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  type RouterHistory,
} from '@tanstack/react-router'
import App from './App'
import { AppShell } from '@/components/shell'
import { MarketingPage } from '@/features/marketing'
import { SignInPage } from '@/features/sign-in'
import { NotFoundPage } from '@/features/not-found'
import { DashboardSkeleton } from '@/components/dashboard-skeleton'
import { navigationPages } from '@/features/navigation'
import { landingDescription, landingTitle } from '@/metadata'

const rootRoute = createRootRoute({
  component: App,
  notFoundComponent: NotFoundPage,
  head: () => ({
    meta: [
      {
        name: 'description',
        content: landingDescription,
      },
    ],
  }),
})
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  head: () => ({
    meta: [{ title: landingTitle }],
  }),
  component: MarketingPage,
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

export function createAppRouter(history: RouterHistory) {
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
