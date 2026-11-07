import { useEffect, useRef, useState } from 'react'
import { authSetupInput, authSignInInput } from '@aircastle/contracts'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { AtSignIcon } from 'lucide-react'
import { useAuth } from './context'

export function AuthForm({ purpose }: { purpose: 'setup' | 'sign-in' }) {
  const { auth } = useAuth()
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({})
  const [pending, setPending] = useState(false)
  const submitting = useRef(false)
  const [sent, setSent] = useState(false)
  const [message, setMessage] = useState('')
  const [retryAt, setRetryAt] = useState(0)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!retryAt) return
    const timer = window.setInterval(() => setNow(Date.now()), 100)
    return () => window.clearInterval(timer)
  }, [retryAt])
  const seconds = Math.max(0, Math.ceil((retryAt - now) / 1000))
  return (
    <>
      <form
        noValidate
        onSubmit={async (event) => {
          event.preventDefault()
          if (submitting.current || Date.now() < retryAt) return
          const values = new FormData(event.currentTarget)
          const input =
            purpose === 'setup'
              ? authSetupInput({ name: values.get('name'), email: values.get('email') })
              : authSignInInput({ email: values.get('email') })
          if ('summary' in input) {
            const fields: { name?: string; email?: string } = {}
            for (const error of input) {
              if (error.path[0] === 'name')
                fields.name = 'Enter a name with 1 through 120 characters.'
              if (error.path[0] === 'email') fields.email = 'Enter a valid email address.'
            }
            setErrors(fields)
            return
          }
          submitting.current = true
          setPending(true)
          setErrors({})
          setSent(false)
          setMessage('')
          const result = await auth.request(`/auth/${purpose}`, {
            ...input,
            ...(auth.returnTo ? { returnTo: auth.returnTo } : {}),
          })
          submitting.current = false
          setPending(false)
          if (result.kind === 'ok') setSent(true)
          else if (result.kind === 'email-not-allowed')
            setErrors({ email: 'This email is not allowed for initial setup' })
          else if (result.kind === 'throttled') {
            setRetryAt(result.retryAt)
            setNow(Date.now())
          } else if (result.kind === 'setup-complete')
            setMessage('Setup is complete. Sign in to continue')
          else setMessage('Could not create your sign-in email. Try again.')
        }}
      >
        <FieldGroup className="gap-4">
          {purpose === 'setup' && (
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="name"
                  name="name"
                  autoComplete="name"
                  aria-invalid={!!errors.name}
                  aria-describedby={errors.name ? 'name-error' : undefined}
                />
              </InputGroup>
              {errors.name && <FieldError id="name-error">{errors.name}</FieldError>}
            </Field>
          )}
          <Field data-invalid={!!errors.email}>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <InputGroup>
              <InputGroupInput
                id="email"
                name="email"
                autoFocus={purpose === 'sign-in'}
                placeholder="your.email@example.com"
                type="email"
                autoComplete="email"
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 'email-error' : undefined}
              />
              <InputGroupAddon align="inline-start">
                <AtSignIcon aria-hidden="true" />
              </InputGroupAddon>
            </InputGroup>
            {errors.email && <FieldError id="email-error">{errors.email}</FieldError>}
          </Field>
          <Button className="w-full" type="submit" disabled={pending || seconds > 0}>
            {pending ? 'Sending…' : purpose === 'setup' ? 'Continue' : 'Send sign-in link'}
          </Button>
        </FieldGroup>
      </form>
      {message && <p role="alert">{message}</p>}
      {seconds > 0 && (
        <p role="alert">
          Too many requests. Try again in {seconds} {seconds === 1 ? 'second' : 'seconds'}.
        </p>
      )}
      {sent && (
        <div role="status" className="space-y-3 rounded-lg border bg-muted/30 p-4 text-sm">
          <p>
            {purpose === 'setup'
              ? 'Check your development inbox'
              : 'If this account exists, a sign-in link is available in the development inbox.'}
          </p>
          <a className="underline underline-offset-4" href="/development-inbox">
            Open development inbox
          </a>
        </div>
      )}
    </>
  )
}
