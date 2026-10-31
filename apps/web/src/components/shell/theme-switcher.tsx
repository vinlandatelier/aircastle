import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'
import { useTheme } from '@/features/theme'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const themes = [
  { value: 'light', label: 'Light', icon: SunIcon },
  { value: 'dark', label: 'Dark', icon: MoonIcon },
  { value: 'system', label: 'System', icon: MonitorIcon },
] as const

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={<Button aria-label="Choose theme" size="icon-sm" variant="plain" />}
            />
          }
        >
          <SunIcon aria-hidden="true" className="dark:hidden" />
          <MoonIcon aria-hidden="true" className="hidden dark:block" />
        </TooltipTrigger>
        <TooltipContent side="bottom">Switch theme</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" aria-label="Theme">
        <DropdownMenuRadioGroup value={theme ?? 'system'} onValueChange={setTheme}>
          {themes.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value} closeOnClick>
              <option.icon aria-hidden="true" />
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
