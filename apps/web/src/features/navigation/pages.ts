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
      { title: 'Tasks', path: '/dash/tasks', icon: ListTodoIcon },
      { title: 'Collections', path: '/dash/collections', icon: LayoutGridIcon },
      { title: 'Media Library', path: '/dash/media', icon: ImagesIcon },
      { title: 'Analytics', path: '/dash/analytics', icon: BarChart3Icon },
    ],
  },
  {
    label: 'Administration',
    items: [
      { title: 'Users', path: '/dash/users', icon: UsersIcon },
      { title: 'Access Tokens', path: '/dash/access-tokens', icon: KeyRoundIcon },
      { title: 'Settings', path: '/dash/settings', icon: SettingsIcon },
    ],
  },
] as const
