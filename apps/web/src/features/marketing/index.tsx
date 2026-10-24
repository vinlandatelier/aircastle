import { Header } from './header'
import { HeroSection } from './hero'
import { LogoCloud } from './logo-cloud'

export function MarketingPage() {
  return (
    <div data-theme-scope="marketing" className="min-h-svh">
      <Header />
      <main data-theme-scope="marketing">
        <HeroSection />
        <LogoCloud />
      </main>
    </div>
  )
}
