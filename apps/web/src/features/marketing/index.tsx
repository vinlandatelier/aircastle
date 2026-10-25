import { Header } from './header'

export function MarketingPage() {
  return (
    <div data-theme-scope="marketing" className="flex min-h-svh flex-col">
      <Header />
      <main data-theme-scope="marketing" className="flex-1" />
    </div>
  )
}
