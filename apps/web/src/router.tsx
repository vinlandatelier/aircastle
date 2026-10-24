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
import { SignInPage } from '@/features/sign-in'
import { DashboardSkeleton } from '@/components/dashboard-skeleton'
import { navigationPaths } from '@/features/navigation'

const rootRoute = createRootRoute({ component: App })
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/dash/collections', replace: true })
  },
})
const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dash',
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
})
const dashboardIndexRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/dash/collections', replace: true })
  },
})
const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-in',
  component: SignInPage,
})
type DashboardPagePath = (typeof navigationPaths)[number] extends `/dash/${infer Path}`
  ? Path
  : never

const pageRoutes = navigationPaths.map((path) =>
  createRoute({
    getParentRoute: () => dashboardRoute,
    path: path.replace('/dash/', '') as DashboardPagePath,
    component: DashboardSkeleton,
  }),
)
const routeTree = rootRoute.addChildren([
  indexRoute,
  signInRoute,
  dashboardRoute.addChildren([dashboardIndexRoute, ...pageRoutes]),
])

export function createAppRouter(history?: RouterHistory) {
  return createRouter({ routeTree, history })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
