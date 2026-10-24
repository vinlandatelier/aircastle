import { AppShell } from '@/components/shell'
import { Outlet } from '@tanstack/react-router'
import { ThemeProvider } from 'next-themes'

function App() {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      storageKey="aircastle-theme"
      enableSystem
    >
      <AppShell>
        <Outlet />
      </AppShell>
    </ThemeProvider>
  )
}

export default App
