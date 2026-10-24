import { Link } from '@tanstack/react-router'
import { AtSignIcon, ChevronLeftIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { FloatingPaths } from './floating-paths'

export function SignInPage() {
  return (
    <main
      data-theme-scope="marketing"
      className="relative min-h-svh overflow-hidden lg:grid lg:grid-cols-2"
    >
      <div className="relative hidden flex-col border-r bg-secondary p-10 lg:flex dark:bg-secondary/20">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-linear-to-b from-transparent via-transparent to-background"
        />
        <div className="relative z-10 flex items-center gap-2">
          <span aria-hidden="true" className="brand-logo block size-7 shrink-0" />
        </div>
        <FloatingPaths position={1} />
        <FloatingPaths position={-1} />
      </div>
      <div className="relative flex min-h-svh min-w-0 flex-col justify-center px-6 py-24 sm:px-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 isolate -z-10 contain-strict bg-[radial-gradient(ellipse_110%_85%_at_100%_0%,--theme(--color-foreground/.13),transparent_72%),radial-gradient(ellipse_90%_70%_at_0%_100%,--theme(--color-foreground/.04),transparent_70%)]"
        />
        <Button
          role="link"
          className="absolute top-7 left-5"
          variant="ghost"
          render={<Link to="/dash" />}
          nativeButton={false}
        >
          <ChevronLeftIcon aria-hidden="true" data-icon="inline-start" />
          Home
        </Button>
        <div className="mx-auto flex w-full min-w-0 max-w-sm flex-col gap-4">
          <div className="flex items-center gap-2 lg:hidden">
            <span aria-hidden="true" className="brand-logo block size-7 shrink-0" />
          </div>
          <h1 className="text-2xl font-semibold tracking-wide">Sign in to Aircastle</h1>
          <form onSubmit={(event) => event.preventDefault()}>
            <FieldGroup className="gap-2">
              <Field>
                <FieldLabel className="sr-only" htmlFor="email">
                  Email
                </FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    id="email"
                    name="email"
                    placeholder="your.email@example.com"
                    type="email"
                    autoComplete="email"
                  />
                  <InputGroupAddon align="inline-start">
                    <AtSignIcon aria-hidden="true" />
                  </InputGroupAddon>
                </InputGroup>
              </Field>
              <Button className="w-full" type="submit" disabled>
                Continue with email
              </Button>
            </FieldGroup>
          </form>
          <p className="mt-8 text-sm text-muted-foreground">
            By clicking continue, you agree to our{' '}
            <a
              className="underline underline-offset-4 hover:text-primary"
              href="/terms-of-service"
              target="_blank"
              rel="noopener noreferrer"
            >
              Terms of Service
            </a>{' '}
            and{' '}
            <a
              className="underline underline-offset-4 hover:text-primary"
              href="/privacy-policy"
              target="_blank"
              rel="noopener noreferrer"
            >
              Privacy Policy
            </a>
            .
          </p>
        </div>
      </div>
    </main>
  )
}
