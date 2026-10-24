import { Sidebar, SidebarContent, SidebarTrigger } from '@/components/ui/sidebar'
import { ChevronLeftIcon } from 'lucide-react'
import { SidebarNavigation } from '@/navigation'

export function AppSidebar() {
  return (
    <Sidebar
      className="*:data-[slot=sidebar-inner]:bg-background"
      collapsible="icon"
      variant="sidebar"
    >
      <SidebarContent
        role="navigation"
        aria-label="Main navigation"
        className="sidebar-navigation gap-3 px-1 py-4 transition-[gap] duration-150 ease-out motion-reduce:transition-none group-data-[collapsible=icon]:gap-1"
      >
        <SidebarNavigation />
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
