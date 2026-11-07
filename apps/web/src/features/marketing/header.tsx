import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { cn } from 'cn'
import { ArrowRightIcon } from 'lucide-react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeSwitcher } from '@/components/shell'

export function Header() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const updateScrolled = () => setScrolled(window.scrollY > 0)
    updateScrolled()
    window.addEventListener('scroll', updateScrolled, { passive: true })
    return () => window.removeEventListener('scroll', updateScrolled)
  }, [])

  return (
    <header
      className={cn(
        'sticky top-0 z-20 w-full text-foreground motion-safe:transition-colors motion-safe:duration-200',
        scrolled ? 'bg-background' : 'bg-transparent',
      )}
    >
      <nav
        aria-label="Marketing navigation"
        className="mx-auto flex min-h-16 w-full max-w-[70rem] items-center justify-between gap-4 px-4"
      >
        <Link
          to="/"
          aria-label="Aircastle home"
          className="brand-link inline-flex items-center gap-2.5 rounded-md p-2 text-[1.375rem] font-[400] focus-visible:outline-2 focus-visible:outline-ring"
        >
          <span aria-hidden="true" className="brand-logo block size-6" />
          Aircastle
        </Link>
        <div className="flex items-center gap-1">
          <TooltipProvider>
            <ThemeSwitcher className="size-9 rounded-lg text-foreground hover:text-muted-foreground [&_svg]:size-5!" />
          </TooltipProvider>
          <span data-header-divider aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
          <Link
            to="/dash"
            className="group inline-flex items-center gap-1.5 rounded-lg px-3 py-2 whitespace-nowrap text-foreground hover:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            Open Aircastle
            <ArrowRightIcon
              aria-hidden="true"
              className="size-5 transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        </div>
      </nav>
    </header>
  )
}
