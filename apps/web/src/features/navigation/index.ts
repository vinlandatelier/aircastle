import { navigationGroups } from '@/features/navigation/pages'

export { SidebarNavigation, PageSearch } from './navigation'

export const navigationPages = navigationGroups.flatMap((group) =>
  group.items.map(({ segment, title }) => ({ segment, title })),
)
