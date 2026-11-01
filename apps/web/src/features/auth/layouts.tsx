import { Outlet, useRouteContext, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import App from '@/App'
import { AppShell, AccountControls } from '@/components/shell'
import { Button } from '@/components/ui/button'
import { AuthContext, useAuth } from './context'
import { WorkspacePage } from './workspaces'

export function AuthRoot() {
  const { auth, view } = useRouteContext({ from: '__root__' })
  const router = useRouter()
  return (
    <AuthContext value={{ auth, view }}>
      <App>
        {view.kind === 'disabled' ? (
          <main className="p-8">
            Local authentication is not enabled. For local development, set
            AIRCASTLE_ENV=development.
          </main>
        ) : view.kind === 'failure' ? (
          <main className="space-y-4 p-8">
            <p role="alert">Could not load your session. Please try again.</p>
            <Button onClick={() => void router.invalidate()}>Retry</Button>
          </main>
        ) : (
          <Outlet />
        )}
      </App>
    </AuthContext>
  )
}

function useShellAccount() {
  const { auth, view } = useAuth()
  const router = useRouter()
  const [failure, setFailure] = useState(false)
  const account =
    view.kind === 'authenticated'
      ? {
          user: view.session.user,
          signOut: async () => {
            const result = await auth.request('/auth/sign-out', {})
            if (result.kind === 'ok') await router.navigate({ to: '/sign-in', replace: true })
            else setFailure(true)
          },
        }
      : null
  return { account, failure }
}

export function DashboardLayout() {
  const { account, failure } = useShellAccount()
  if (!account) return null
  return (
    <AppShell account={account}>
      {failure && <p role="alert">Could not sign out. Try again.</p>}
      <Outlet />
    </AppShell>
  )
}

export function Workspaces({ title }: { title: 'Workspaces' | 'Create a workspace' | 'Projects' }) {
  const { account, failure } = useShellAccount()
  if (!account) return null
  return (
    <>
      {failure && <p role="alert">Could not sign out. Try again.</p>}
      <WorkspacePage title={title} controls={<AccountControls account={account} />} />
    </>
  )
}
