import { Header } from './header'

export function MarketingPage() {
  return (
    <div data-theme-scope="marketing" className="flex min-h-svh flex-col">
      <Header />
      <main data-theme-scope="marketing" className="flex-1">
        <section className="mx-auto w-full max-w-[85rem] px-4 pt-24 pb-16">
          <h1 className="text-[2.25rem] md:text-[3rem] leading-[1.15] font-[250] tracking-tight">
            <span className="block">Autopilot for everything you write.</span>
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
