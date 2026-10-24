import { Link } from '@tanstack/react-router'
import { ArrowLeftIcon, ArrowUpRightIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <main
      data-theme-scope="marketing"
      className="relative flex min-h-svh items-center overflow-hidden bg-[radial-gradient(ellipse_at_100%_0%,--theme(--color-foreground/.06),transparent_60%)]"
    >
      <title>Aircastle - Page not found</title>
      <meta name="robots" content="noindex" />
      <Link to="/" aria-label="Aircastle home" className="absolute top-8 left-6 rounded sm:left-10">
        <span aria-hidden="true" className="brand-logo block size-7" />
      </Link>
      <div className="mx-auto flex w-full max-w-6xl flex-col-reverse items-center gap-10 px-6 py-28 md:grid md:grid-cols-2 md:gap-16 md:px-14">
        <div className="relative flex flex-col items-center gap-6 text-center md:items-start md:text-left">
          <p className="font-mono text-xs tracking-[.18em] text-muted-foreground uppercase">
            Error 404
          </p>
          <h1 className="text-4xl leading-tight font-medium tracking-tight lg:text-5xl">
            Page not found
          </h1>
          <p className="max-w-sm text-sm leading-7 text-muted-foreground sm:text-base">
            We couldn't find this page. Check the address or return to the homepage.
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3 md:justify-start">
            <Button role="link" size="lg" render={<Link to="/" />} nativeButton={false}>
              <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
              Back to home
            </Button>
            <Button
              role="link"
              variant="plain"
              size="lg"
              render={<Link to="/sign-in" />}
              nativeButton={false}
            >
              Sign in
              <ArrowUpRightIcon aria-hidden="true" data-icon="inline-end" />
            </Button>
          </div>
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none relative grid aspect-square w-full max-w-72 place-items-center select-none md:max-w-none"
        >
          <div className="absolute size-4/5 -rotate-18 border border-foreground/10" />
          <div className="absolute size-[72%] rotate-12 border border-foreground/10" />
          <span className="relative text-[clamp(7rem,16vw,12rem)] leading-none font-medium tracking-[-.075em] text-transparent [-webkit-text-stroke:1px_color-mix(in_oklab,var(--foreground)_45%,transparent)]">
            404
          </span>
        </div>
      </div>
    </main>
  )
}
