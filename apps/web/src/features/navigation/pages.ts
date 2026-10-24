import {
  BarChart3Icon,
  ImagesIcon,
  KeyRoundIcon,
  LayoutGridIcon,
  ListTodoIcon,
  SettingsIcon,
  UsersIcon,
} from 'lucide-react'

export const navigationGroups = [
  {
    label: 'Product',
    items: [
      {
        title: 'Tasks',
        path: '/dash/workspaces/$workspaceId/projects/$projectId/tasks',
        icon: ListTodoIcon,
      },
      {
        title: 'Collections',
        path: '/dash/workspaces/$workspaceId/projects/$projectId/collections',
        icon: LayoutGridIcon,
      },
      {
        title: 'Media Library',
        path: '/dash/workspaces/$workspaceId/projects/$projectId/media',
        icon: ImagesIcon,
      },
      {
        title: 'Analytics',
        path: '/dash/workspaces/$workspaceId/projects/$projectId/analytics',
        icon: BarChart3Icon,
      },
    ],
  },
  {
    label: 'Administration',
    items: [
      {
        title: 'Users',
        path: '/dash/workspaces/$workspaceId/projects/$projectId/users',
        icon: UsersIcon,
      },
      {
        title: 'Access Tokens',
        path: '/dash/workspaces/$workspaceId/projects/$projectId/access-tokens',
        icon: KeyRoundIcon,
      },
      {
        title: 'Settings',
        path: '/dash/workspaces/$workspaceId/projects/$projectId/settings',
        icon: SettingsIcon,
      },
    ],
  },
] as const
