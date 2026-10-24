import { cn } from 'cn'
import { Link } from '@tanstack/react-router'
import { ArrowRightIcon, LayoutDashboardIcon, RocketIcon } from 'lucide-react'

export function HeroSection() {
  return (
    <section id="overview" className="relative mx-auto w-full max-w-5xl">
      <div
        aria-hidden="true"
        className="absolute inset-0 isolate hidden overflow-hidden contain-strict lg:block"
      >
        <div className="absolute inset-0 -top-14 isolate -z-10 bg-[radial-gradient(35%_80%_at_49%_0%,--theme(--color-foreground/.08),transparent)] contain-strict" />
      </div>

      <div
        aria-hidden="true"
        className="absolute inset-0 mx-auto hidden min-h-screen w-full max-w-5xl lg:block"
      >
        <div className="mask-y-from-80% mask-y-to-100% absolute inset-y-0 left-0 z-10 h-full w-px bg-foreground/15" />
        <div className="mask-y-from-80% mask-y-to-100% absolute inset-y-0 right-0 z-10 h-full w-px bg-foreground/15" />
      </div>

      <div className="relative flex flex-col items-center justify-center gap-5 px-6 pt-24 pb-24 sm:px-16 md:pt-32 md:pb-30">
        <div aria-hidden="true" className="absolute inset-0 -z-1 size-full overflow-hidden">
          <div className="absolute inset-y-0 left-4 w-px bg-linear-to-b from-transparent via-border to-border md:left-8" />
          <div className="absolute inset-y-0 right-4 w-px bg-linear-to-b from-transparent via-border to-border md:right-8" />
          <div className="absolute inset-y-0 left-8 w-px bg-linear-to-b from-transparent via-border/50 to-border/50 md:left-12" />
          <div className="absolute inset-y-0 right-8 w-px bg-linear-to-b from-transparent via-border/50 to-border/50 md:right-12" />
        </div>

        <a
          className={cn(
            'group mx-auto flex w-fit items-center gap-3 rounded-full border bg-card px-3 py-1 shadow',
            'motion-safe:fade-in motion-safe:slide-in-from-bottom-10 motion-safe:animate-in fill-mode-backwards transition-all delay-500 duration-500 ease-out',
          )}
          href="#stack"
        >
          <RocketIcon aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
          <span className="text-xs">Meet Aircastle</span>
          <span className="block h-5 border-l" />

          <ArrowRightIcon
            aria-hidden="true"
            className="size-3 shrink-0 duration-150 ease-out motion-safe:group-hover:translate-x-1"
          />
        </a>

        <h1
          className={cn(
            'font-heading motion-safe:fade-in motion-safe:slide-in-from-bottom-10 motion-safe:animate-in text-balance fill-mode-backwards text-center text-[clamp(1.75rem,6vw,2.5rem)] tracking-tight wrap-anywhere delay-100 duration-500 ease-out md:text-5xl lg:text-6xl',
            'text-shadow-[0_0px_50px_theme(--color-foreground/.2)]',
          )}
        >
          Your content. <br /> Defined in code.
        </h1>

        <p className="motion-safe:fade-in motion-safe:slide-in-from-bottom-10 mx-auto max-w-md motion-safe:animate-in fill-mode-backwards text-center text-base text-foreground/80 tracking-wider delay-200 duration-500 ease-out sm:text-lg md:text-xl">
          A code-first, headless CMS for managing written content on your terms.
        </p>

        <div className="motion-safe:fade-in motion-safe:slide-in-from-bottom-10 flex motion-safe:animate-in flex-row flex-wrap items-center justify-center gap-3 fill-mode-backwards pt-2 delay-300 duration-500 ease-out">
          <Link
            to="/dash"
            className="inline-flex min-h-10 max-w-full items-center justify-center gap-2 rounded-full bg-secondary px-4 py-2 text-center text-sm text-secondary-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          >
            <LayoutDashboardIcon aria-hidden="true" className="size-4 shrink-0" />
            Explore dashboard
          </Link>
          <Link
            to="/sign-in"
            className="inline-flex min-h-10 max-w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-center text-sm text-primary-foreground hover:bg-primary/80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          >
            Get started
            <ArrowRightIcon aria-hidden="true" className="size-4 shrink-0" />
          </Link>
        </div>
      </div>
    </section>
  )
}
