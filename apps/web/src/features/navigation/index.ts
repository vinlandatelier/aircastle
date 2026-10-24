import { navigationGroups } from './pages'

export { SidebarNavigation, PageSearch } from './navigation'

export const navigationPages = navigationGroups.flatMap((group) =>
  group.items.map(({ path, title }) => ({ path, title })),
)
