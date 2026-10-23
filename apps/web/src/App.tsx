import { AppShell } from '@/components/app-shell'
import { DashboardSkeleton } from '@/components/dashboard-skeleton'
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
        <DashboardSkeleton />
      </AppShell>
    </ThemeProvider>
  )
}

export default App
