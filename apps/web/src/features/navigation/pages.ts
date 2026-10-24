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
      { title: 'Tasks', path: '/tasks', icon: ListTodoIcon },
      { title: 'Collections', path: '/collections', icon: LayoutGridIcon },
      { title: 'Media Library', path: '/media', icon: ImagesIcon },
      { title: 'Analytics', path: '/analytics', icon: BarChart3Icon },
    ],
  },
  {
    label: 'Administration',
    items: [
      { title: 'Users', path: '/users', icon: UsersIcon },
      { title: 'Access Tokens', path: '/access-tokens', icon: KeyRoundIcon },
      { title: 'Settings', path: '/settings', icon: SettingsIcon },
    ],
  },
] as const
