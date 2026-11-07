import { MoonIcon, SunIcon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/** A one-click switch between dark and light, pressed while the dark theme is on. */
export function ThemeSwitcher({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  const dark = resolvedTheme !== 'light'

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label="Dark theme"
            aria-pressed={dark}
            size="icon-sm"
            variant="plain"
            className={className}
            onClick={() => setTheme(dark ? 'light' : 'dark')}
          />
        }
      >
        <SunIcon aria-hidden="true" className="dark:hidden" />
        <MoonIcon aria-hidden="true" className="hidden dark:block" />
      </TooltipTrigger>
      <TooltipContent side="bottom">{dark ? 'Switch to light' : 'Switch to dark'}</TooltipContent>
    </Tooltip>
  )
}
