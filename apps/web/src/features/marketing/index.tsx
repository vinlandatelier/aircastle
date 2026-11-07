import { Link } from '@tanstack/react-router'
import { ArrowRightIcon } from 'lucide-react'
import { Header } from './header'
import { ProductDemo } from './product-demo'
import { RotatingWord } from './rotating-word'

const heroWords = ['write', 'research', 'publish', 'audit'] as const

export function MarketingPage() {
  return (
    <div data-theme-scope="marketing" className="flex min-h-svh flex-col">
      <Header />
      <main data-theme-scope="marketing" className="flex-1">
        <section className="mx-auto w-full max-w-[70rem] px-4 pt-10 pb-12 md:pt-24 md:pb-16">
          <p className="mb-6 inline-flex items-center gap-1.5 text-base text-muted-foreground md:mb-10 md:text-lg">
            Presented by{' '}
            <a
              href="https://vinland.com.au"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              <span aria-hidden="true" className="vinland-logo ml-1 inline-block size-[1.125rem]" />
              Vinland
            </a>
          </p>
          <h1 className="text-[2.25rem] md:text-[3rem] leading-[1.15] font-[250] tracking-tight">
            <span className="block">
              Autopilot for everything <br className="md:hidden" />
              you <RotatingWord words={heroWords} suffix="." />
            </span>
            <span className="block text-muted-foreground">
              Agents for your content operations, <br className="hidden md:block" />
              so you can focus on thought.
            </span>
          </h1>
          <p className="mt-6 max-w-[46rem] text-lg leading-relaxed text-balance text-muted-foreground md:mt-8 md:text-xl">
            Aircastle is the headless CMS that gets you from idea to published faster. Our agents
            take on the busywork, so you can publish more than ever before.
          </p>
          <div className="mt-8 flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2 md:mt-10">
            <Link
              to="/sign-in"
              className="inline-flex items-center rounded-lg bg-primary px-4 py-2 font-[400] text-primary-foreground transition-colors hover:bg-primary/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Get started
            </Link>
            <a
              href="/demo"
              className="group inline-flex items-center gap-1.5 rounded-lg px-0 py-2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring sm:px-4"
            >
              See Aircastle in action
              <ArrowRightIcon
                aria-hidden="true"
                className="size-5 transition-transform group-hover:translate-x-0.5"
              />
            </a>
          </div>
        </section>
        <ProductDemo />
      </main>
    </div>
  )
}
