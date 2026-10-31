import { cn } from '@/lib/utils'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppHeader } from './app-header'
import { AppSidebar } from './app-sidebar'
import { NavUser, type ShellAccount } from './nav-user'
import { ThemeSwitcher } from './theme-switcher'
import { TooltipProvider } from '@/components/ui/tooltip'

export function AppShell({
  children,
  account,
}: {
  children: React.ReactNode
  account: ShellAccount
}) {
  return (
    <TooltipProvider>
      <SidebarProvider
        data-theme-scope="dashboard"
        className="flex-col [--app-header-height:3.5rem] [--app-wrapper-max-width:80rem] [--sidebar-top:var(--app-header-height)]"
      >
        <AppHeader account={account} />
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

export function AccountControls({ account }: { account: ShellAccount }) {
  return (
    <TooltipProvider>
      <ThemeSwitcher />
      <NavUser {...account} />
    </TooltipProvider>
  )
}
