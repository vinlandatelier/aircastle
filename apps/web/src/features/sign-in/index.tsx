import { Link } from '@tanstack/react-router'
import { AtSignIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { CloudArt } from './cloud-art'

export function SignInPage() {
  return (
    <main
      data-theme-scope="marketing"
      className="relative min-h-svh overflow-hidden lg:grid lg:grid-cols-2"
    >
      <div className="relative hidden lg:block">
        <CloudArt />
      </div>
      <div className="relative flex min-h-svh min-w-0 flex-col justify-center bg-background px-6 py-24 sm:px-8">
        <div className="mx-auto flex w-full min-w-0 max-w-[28rem] flex-col gap-5">
          <Link
            to="/"
            aria-label="Aircastle home"
            className="brand-link mb-6 self-start rounded-md focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            <span aria-hidden="true" className="brand-logo block size-10 shrink-0" />
          </Link>
          <h1 className="mb-3 text-[2rem] leading-tight font-[400] tracking-tight">
            Sign in to Aircastle
          </h1>
          <form onSubmit={(event) => event.preventDefault()}>
            <FieldGroup className="gap-3">
              <Field>
                <FieldLabel className="sr-only" htmlFor="email">
                  Email
                </FieldLabel>
                <InputGroup className="h-12 text-base">
                  <InputGroupInput
                    id="email"
                    name="email"
                    placeholder="your.email@example.com"
                    type="email"
                    autoComplete="email"
                    className="text-base md:text-base"
                  />
                  <InputGroupAddon align="inline-start">
                    <AtSignIcon aria-hidden="true" />
                  </InputGroupAddon>
                </InputGroup>
              </Field>
              <Button className="h-12 w-full text-base" type="submit" disabled>
                Continue with email
              </Button>
            </FieldGroup>
          </form>
          <p className="mt-6 text-base text-muted-foreground">
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
