import { Outlet } from '@tanstack/react-router'
import { ThemeProvider, useTheme } from 'next-themes'
import { useEffect } from 'react'

function ThemeFavicon() {
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    if (!resolvedTheme) return
    document
      .querySelector('link[rel="icon"]')
      ?.setAttribute('href', `/brand/favicon-${resolvedTheme === 'dark' ? 'dark' : 'light'}.svg`)
  }, [resolvedTheme])

  return null
}

function App() {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      storageKey="aircastle-theme"
      enableSystem
    >
      <ThemeFavicon />
      <Outlet />
    </ThemeProvider>
  )
}

export default App
