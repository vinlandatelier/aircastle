import { navigationGroups } from './pages'

export { SidebarNavigation, PageSearch } from './navigation'

export const navigationPaths = navigationGroups.flatMap((group) =>
  group.items.map((item) => item.path),
)
