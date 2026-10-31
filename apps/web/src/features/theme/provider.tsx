import { useEffect, useState } from 'react'

import { themeStorageKey } from '@/theme'
import { ThemeContext, type Theme } from './context'
function readTheme(value: string | null): Theme {
  return value === 'light' || value === 'dark' ? value : 'system'
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      return readTheme(localStorage.getItem(themeStorageKey))
    } catch (error) {
      if (!(error instanceof DOMException)) throw error
      return 'system'
    }
  })
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    function apply() {
      const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme
      document.documentElement.classList.remove('light', 'dark')
      document.documentElement.classList.add(resolved)
      document.documentElement.style.colorScheme = resolved
      document
        .querySelector('link[rel="icon"]')
        ?.setAttribute('href', `/brand/favicon-${resolved}.svg`)
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === themeStorageKey || event.key === null)
        setThemeState(readTheme(event.newValue))
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])
  function setTheme(value: string) {
    const choice = readTheme(value)
    setThemeState(choice)
    try {
      localStorage.setItem(themeStorageKey, choice)
    } catch (error) {
      if (!(error instanceof DOMException)) throw error
    }
  }
  return <ThemeContext value={{ theme, setTheme }}>{children}</ThemeContext>
}
