import { Header } from './header'
import { RotatingWord } from './rotating-word'

const heroWords = ['write', 'research', 'publish', 'audit'] as const

export function MarketingPage() {
  return (
    <div data-theme-scope="marketing" className="flex min-h-svh flex-col">
      <Header />
      <main data-theme-scope="marketing" className="flex-1">
        <section className="mx-auto w-full max-w-[85rem] px-4 pt-24 pb-16">
          <p className="mb-10 inline-flex items-center gap-1.5 text-lg text-muted-foreground">
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
              Autopilot for everything you <RotatingWord words={heroWords} suffix="." />
            </span>
            <span className="block text-muted-foreground">
              Agents for your content operations, <br className="hidden md:block" />
              so you can focus on thought.
            </span>
          </h1>
        </section>
      </main>
    </div>
  )
}
