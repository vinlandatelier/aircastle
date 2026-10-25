import {
  BarChart3Icon,
  ImagesIcon,
  KeyRoundIcon,
  LayoutGridIcon,
  ListTodoIcon,
  SettingsIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react'

function dashboardPage<const Segment extends string>(
  segment: Segment,
  title: string,
  icon: LucideIcon,
) {
  return {
    title,
    segment,
    path: `/dash/workspaces/$workspaceId/projects/$projectId/${segment}` as const,
    icon,
  }
}

export const navigationGroups = [
  {
    label: 'Product',
    items: [
      dashboardPage('tasks', 'Tasks', ListTodoIcon),
      dashboardPage('collections', 'Collections', LayoutGridIcon),
      dashboardPage('media', 'Media Library', ImagesIcon),
      dashboardPage('analytics', 'Analytics', BarChart3Icon),
    ],
  },
  {
    label: 'Administration',
    items: [
      dashboardPage('users', 'Users', UsersIcon),
      dashboardPage('access-tokens', 'Access Tokens', KeyRoundIcon),
      dashboardPage('settings', 'Settings', SettingsIcon),
    ],
  },
] as const
