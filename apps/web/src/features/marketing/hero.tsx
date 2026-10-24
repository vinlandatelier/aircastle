import { Link } from '@tanstack/react-router'
import { ArrowRightIcon, LayoutDashboardIcon, RocketIcon } from 'lucide-react'
import { MeshBackground } from './mesh-background'

export function HeroSection() {
  return (
    <section
      id="overview"
      aria-labelledby="hero-heading"
      data-theme-scope="hero"
      className="relative isolate -mt-[calc(4rem+1px)] flex min-h-svh w-full items-center justify-center overflow-hidden px-6 pt-36 pb-28 text-foreground sm:px-12 md:pt-32"
    >
      <MeshBackground />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center gap-7 text-center">
        <a
          href="#stack"
          className="inline-flex items-center gap-2 rounded-full border border-border bg-card/30 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <RocketIcon aria-hidden="true" className="size-3" />
          Meet Aircastle
          <ArrowRightIcon aria-hidden="true" className="size-3" />
        </a>
        <h1
          id="hero-heading"
          className="max-w-full text-[clamp(2.5rem,8vw,7.5rem)] leading-[1.03] font-normal tracking-[-.055em] text-balance wrap-anywhere"
        >
          Your content. <br /> Defined in code.
        </h1>
        <p className="max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
          A code-first, headless CMS for managing written content on your terms.
        </p>
        <div className="mt-2 flex max-w-full flex-wrap items-center justify-center gap-3">
          <Link
            to="/dash"
            className="inline-flex min-h-11 max-w-full items-center justify-center gap-2 rounded-full border border-border bg-secondary/80 px-5 py-2.5 text-sm text-secondary-foreground backdrop-blur-sm transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          >
            <LayoutDashboardIcon aria-hidden="true" className="size-4 shrink-0" />
            Explore dashboard
          </Link>
          <Link
            to="/sign-in"
            className="inline-flex min-h-11 max-w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          >
            Get started
            <ArrowRightIcon aria-hidden="true" className="size-4 shrink-0" />
          </Link>
        </div>
      </div>
    </section>
  )
}
