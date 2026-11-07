import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export function CustomSidebarTrigger() {
  return (
    <Tooltip>
      <TooltipTrigger delay={1000} render={<SidebarTrigger />} />
      <TooltipContent side="bottom">
        <span className="flex items-center gap-2">
          Toggle Sidebar
          <KbdGroup>
            <Kbd>⌘</Kbd>
            <Kbd>b</Kbd>
          </KbdGroup>
        </span>
      </TooltipContent>
    </Tooltip>
  )
}
