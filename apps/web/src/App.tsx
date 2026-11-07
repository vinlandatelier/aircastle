import { HeadContent, Outlet } from '@tanstack/react-router'
import { ThemeProvider, useTheme } from 'next-themes'
import { useEffect } from 'react'
import { themeFavicons, themeStorageKey } from '@/theme'

function ThemeFavicon() {
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    if (!resolvedTheme) return
    document
      .querySelector('link[rel="icon"]')
      ?.setAttribute('href', themeFavicons[resolvedTheme === 'dark' ? 'dark' : 'light'])
  }, [resolvedTheme])

  return null
}

function App() {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      themes={['light', 'dark']}
      storageKey={themeStorageKey}
      enableSystem={false}
    >
      <ThemeFavicon />
      <HeadContent />
      <Outlet />
    </ThemeProvider>
  )
}

export default App
