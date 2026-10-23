'use client'

import { Sidebar, SidebarContent, SidebarTrigger } from '@/components/ui/sidebar'
import { ChevronLeftIcon } from 'lucide-react'
import { navGroups } from '@/components/app-shared'
import { NavGroup } from '@/components/nav-group'

export function AppSidebar() {
  return (
    <Sidebar
      className="*:data-[slot=sidebar-inner]:bg-background"
      collapsible="icon"
      variant="sidebar"
    >
      <SidebarContent className="sidebar-navigation gap-3 px-1 py-4">
        {navGroups.map((group, index) => (
          <NavGroup key={`sidebar-group-${index}`} {...group} />
        ))}
      </SidebarContent>
      <SidebarTrigger
        size="icon-sm"
        variant="outline"
        className="absolute end-0 top-1/2 z-20 hidden -translate-y-1/2 translate-x-1/2 bg-background! md:inline-flex"
      >
        <ChevronLeftIcon
          aria-hidden="true"
          className="text-sidebar-foreground transition-transform duration-150 motion-reduce:transition-none group-data-[state=collapsed]:rotate-180"
        />
      </SidebarTrigger>
    </Sidebar>
  )
}
