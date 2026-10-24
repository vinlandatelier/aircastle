import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  type RouterHistory,
} from '@tanstack/react-router'
import App from './App'
import { DashboardSkeleton } from '@/components/dashboard-skeleton'
import { navigationPaths } from '@/navigation'

const rootRoute = createRootRoute({ component: App })
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/collections', replace: true })
  },
})
const pageRoutes = navigationPaths.map((path) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path,
    component: DashboardSkeleton,
  }),
)
const routeTree = rootRoute.addChildren([indexRoute, ...pageRoutes])

export function createAppRouter(history?: RouterHistory) {
  return createRouter({ routeTree, history })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
