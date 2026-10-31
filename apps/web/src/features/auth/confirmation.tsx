import { useRef, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { useAuth } from './context'
import type { Confirmation } from './browser'
import { destinationPath, type Destination, type HttpResult } from './http'

export function ConfirmationPage({ confirmation }: { confirmation: Confirmation }) {
  const { auth } = useAuth()
  const router = useRouter()
  const [result, setResult] = useState<HttpResult<{ email: string; purpose: 'setup' | 'sign-in' }>>(
    confirmation.preview,
  )
  const [pending, setPending] = useState(false)
  const submitting = useRef(false)
  let message = ''
  let next = confirmation.purpose
  if (result.kind === 'invalid-link') {
    message = 'This link is invalid or has expired. Request a new link.'
    next = result.next
  } else if (result.kind === 'superseded-link') {
    message = 'A newer sign-in link was requested. Use the latest email.'
    next = result.next
  } else if (result.kind === 'setup-complete') {
    message = 'Setup is complete. Sign in to continue'
    next = 'sign-in'
  } else if (result.kind !== 'ok')
    message = 'Could not confirm this link. Try again or request a new link.'
  return (
    <>
      {result.kind === 'ok' ? (
        <>
          <h1 className="break-words text-2xl font-semibold">Continue as {result.value.email}</h1>
          <Button
            disabled={pending}
            onClick={async () => {
              if (submitting.current) return
              submitting.current = true
              setPending(true)
              const confirmed = await auth.request<{ destination: Destination }>('/auth/confirm', {
                purpose: confirmation.purpose,
                token: confirmation.token,
              })
              submitting.current = false
              setPending(false)
              if (confirmed.kind === 'ok') {
                auth.clearConfirmation()
                await router.navigate({
                  href: destinationPath(confirmed.value.destination),
                  replace: true,
                })
              } else setResult(confirmed)
            }}
          >
            Continue
          </Button>
        </>
      ) : (
        <>
          <p role="alert">{message}</p>
          <a
            className="underline underline-offset-4"
            href={`/${next}`}
            onClick={() => auth.clearConfirmation()}
          >
            {next === 'setup' ? 'Return to setup' : 'Sign in'}
          </a>
        </>
      )}
    </>
  )
}
