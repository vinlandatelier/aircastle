import type { ReactNode } from 'react'
import {
  LayoutGridIcon,
  ImagesIcon,
  UsersIcon,
  KeyRoundIcon,
  SettingsIcon,
  ListTodoIcon,
  BarChart3Icon,
} from 'lucide-react'

type SidebarNavItem = {
  title: string
  path?: string
  icon?: ReactNode
  isActive?: boolean
  subItems?: SidebarNavItem[]
}

export type SidebarNavGroup = {
  label?: string
  items: SidebarNavItem[]
}

export const navGroups: SidebarNavGroup[] = [
  {
    label: 'Product',
    items: [
      {
        title: 'Tasks',
        path: '#/tasks',
        icon: <ListTodoIcon />,
      },
      {
        title: 'Collections',
        path: '#/collections',
        icon: <LayoutGridIcon />,
        isActive: true,
      },
      {
        title: 'Media Library',
        path: '#/media',
        icon: <ImagesIcon />,
      },
      {
        title: 'Analytics',
        path: '#/analytics',
        icon: <BarChart3Icon />,
      },
    ],
  },
  {
    label: 'Administration',
    items: [
      {
        title: 'Users',
        path: '#/users',
        icon: <UsersIcon />,
      },
      {
        title: 'Access Tokens',
        path: '#/access-tokens',
        icon: <KeyRoundIcon />,
      },
      {
        title: 'Settings',
        path: '#/settings',
        icon: <SettingsIcon />,
      },
    ],
  },
]
