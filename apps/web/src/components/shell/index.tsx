import { cn } from '@/lib/utils'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppHeader } from './app-header'
import { AppSidebar } from './app-sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <SidebarProvider className="flex-col [--app-header-height:3.5rem] [--app-wrapper-max-width:80rem] [--sidebar-top:var(--app-header-height)]">
        <AppHeader />
        <div className="flex flex-1">
          <AppSidebar />
          <SidebarInset>
            <div
              className={cn(
                'flex flex-1 flex-col p-4 md:p-6',
                'mx-auto w-full max-w-(--app-wrapper-max-width)',
              )}
            >
              {children}
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </TooltipProvider>
  )
}
