import { HeadContent } from '@tanstack/react-router'
import { ThemeProvider } from '@/features/theme'

function App({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <HeadContent />
      {children}
    </ThemeProvider>
  )
}

export default App
