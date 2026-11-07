import { createContext, useContext } from 'react'

export type Theme = 'light' | 'dark' | 'system'
export const ThemeContext = createContext<{ theme: Theme; setTheme: (theme: string) => void }>({
  theme: 'system',
  setTheme: () => {},
})
export const useTheme = () => useContext(ThemeContext)
