import { ArrowLeftIcon, RotateCcwIcon } from 'lucide-react'

export function RecoveryPage() {
  return (
    <main
      data-theme-scope="marketing"
      className="relative flex min-h-svh items-center overflow-hidden bg-[radial-gradient(ellipse_at_100%_0%,--theme(--color-foreground/.06),transparent_60%)]"
    >
      <title>Aircastle - Something went wrong</title>
      <meta name="robots" content="noindex" />
      <a href="/" aria-label="Aircastle home" className="absolute top-8 left-6 rounded sm:left-10">
        <span aria-hidden="true" className="brand-logo block size-7" />
      </a>
      <div className="mx-auto flex w-full max-w-6xl flex-col-reverse items-center gap-10 px-6 py-28 md:grid md:grid-cols-2 md:gap-16 md:px-14">
        <div className="relative flex flex-col items-center gap-6 text-center md:items-start md:text-left">
          <p className="font-mono text-xs tracking-[.18em] text-muted-foreground uppercase">
            Unexpected error
          </p>
          <h1 className="text-4xl leading-tight font-medium tracking-tight lg:text-5xl">
            Something went wrong
          </h1>
          <p className="max-w-sm text-sm leading-7 text-muted-foreground sm:text-base">
            An unexpected error interrupted this page. Try loading it again, or return to the
            homepage.
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-5 md:justify-start">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm text-primary-foreground transition-colors hover:bg-primary/80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              <RotateCcwIcon aria-hidden="true" className="size-4" />
              Try again
            </button>
            <a
              href="/"
              className="inline-flex h-9 items-center gap-2 rounded text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              <ArrowLeftIcon aria-hidden="true" className="size-4" />
              Back to home
            </a>
          </div>
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none relative grid aspect-square w-full max-w-72 place-items-center select-none md:max-w-none"
        >
          <div className="absolute size-4/5 -rotate-12 border border-foreground/10" />
          <div className="absolute size-[72%] translate-x-4 translate-y-4 rotate-12 border border-foreground/10" />
          <span className="relative text-[clamp(10rem,24vw,18rem)] leading-none font-medium text-transparent [-webkit-text-stroke:1px_color-mix(in_oklab,var(--foreground)_45%,transparent)]">
            !
          </span>
        </div>
      </div>
    </main>
  )
}
