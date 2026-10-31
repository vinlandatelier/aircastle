import { createContext, useContext } from 'react'
import type { BrowserAuth, AuthView } from './browser'

export const AuthContext = createContext<{ auth: BrowserAuth; view: AuthView } | null>(null)

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('Auth boundary is required')
  return value
}
