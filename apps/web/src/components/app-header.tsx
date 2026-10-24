import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { CustomSidebarTrigger } from '@/components/custom-sidebar-trigger'
import { NavUser } from '@/components/nav-user'
import { ThemeSwitcher } from '@/components/theme-switcher'
import { BookOpenIcon, CrownIcon, PlugIcon, PlusIcon } from 'lucide-react'
import { MarkGithubIcon } from '@primer/octicons-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { PageSearch } from '@/navigation'
import { Link } from '@tanstack/react-router'
import { ProjectSwitcher } from '@/components/project-switcher'

export function AppHeader() {
  return (
    <header
      className={cn(
        'sticky top-0 z-50 flex h-(--app-header-height) shrink-0 items-center justify-between gap-1.5 border-b sm:gap-2',
        'bg-background/95 backdrop-blur-sm supports-backdrop-filter:bg-background/50',
      )}
    >
      <Link
        to="/collections"
        aria-label="Aircastle"
        className="brand-link flex h-full w-(--sidebar-width-icon) shrink-0 items-center justify-center border-r outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span aria-hidden="true" className="brand-logo block size-6 shrink-0" />
      </Link>
      <ProjectSwitcher />
      <div role="group" aria-label="Project actions" className="hidden items-center gap-2 lg:flex">
        <Button aria-label="Connect" variant="outline">
          <PlugIcon data-icon="inline-start" aria-hidden="true" />
          Connect
        </Button>
        <Tooltip>
          <TooltipTrigger render={<Button aria-label="Create" variant="outline" size="icon" />}>
            <PlusIcon aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent side="bottom">Create</TooltipContent>
        </Tooltip>
      </div>
      <div className="md:hidden">
        <CustomSidebarTrigger />
      </div>
      <div className="ms-auto flex items-center gap-2.5 pr-4 sm:gap-4 md:pr-5">
        <PageSearch />
        <Tooltip>
          <TooltipTrigger
            role="link"
            render={
              <Button
                aria-label="Docs"
                size="icon-sm"
                variant="plain"
                nativeButton={false}
                role="link"
                render={<a href="/api/docs" target="_blank" rel="noopener noreferrer" />}
              />
            }
          >
            <BookOpenIcon aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent side="bottom">Documentation</TooltipContent>
        </Tooltip>
        <ThemeSwitcher />
        <Tooltip>
          <TooltipTrigger
            role="link"
            render={
              <Button
                aria-label="GitHub"
                size="icon-sm"
                variant="plain"
                nativeButton={false}
                role="link"
                render={
                  <a
                    href="https://github.com/vinlandatelier/aircastle"
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
              />
            }
          >
            <MarkGithubIcon aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent side="bottom">Source</TooltipContent>
        </Tooltip>
        <Separator className="h-4 data-[orientation=vertical]:self-center" orientation="vertical" />
        <Button aria-label="Upgrade" variant="default" className="hidden md:inline-flex">
          <CrownIcon data-icon="inline-start" aria-hidden="true" />
          Upgrade
        </Button>
        <NavUser />
      </div>
    </header>
  )
}
