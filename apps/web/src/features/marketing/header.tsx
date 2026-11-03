import { Link } from '@tanstack/react-router'
import { ArrowRightIcon, ChevronDownIcon } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

const pageLinks = [
  { label: 'Pricing', href: '/pricing' },
  { label: 'Blog', href: '/blog' },
  { label: 'Roadmap', href: '/roadmap' },
  { label: 'Docs', href: '/docs' },
] as const

const centreItem =
  'inline-flex items-center gap-1 rounded-lg px-3 py-2 text-foreground hover:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring'

export function Header() {
  return (
    <header className="sticky top-0 z-20 w-full border-b border-transparent text-foreground">
      <nav
        aria-label="Marketing navigation"
        className="mx-auto grid min-h-16 w-full max-w-[85rem] grid-cols-[1fr_auto_1fr] items-center gap-4 px-4"
      >
        <Link
          to="/"
          aria-label="Aircastle home"
          className="brand-link inline-flex justify-self-start items-center gap-2.5 rounded-md p-2 text-[1.375rem] font-[400] focus-visible:outline-2 focus-visible:outline-ring"
        >
          <span aria-hidden="true" className="brand-logo block size-6" />
          Aircastle
        </Link>
        <div className="hidden items-center gap-1 md:flex">
          <Popover>
            <PopoverTrigger
              openOnHover
              delay={0}
              closeDelay={150}
              className={`group ${centreItem}`}
            >
              Product
              <ChevronDownIcon
                aria-hidden="true"
                className="size-4 transition-transform duration-200 group-data-[popup-open]:rotate-180"
              />
            </PopoverTrigger>
            <PopoverContent sideOffset={8} className="min-h-40 w-96" />
          </Popover>
          {pageLinks.map(({ label, href }) => (
            <a key={href} href={href} className={centreItem}>
              {label}
            </a>
          ))}
        </div>
        <Link
          to="/dash"
          className="group inline-flex items-center gap-1.5 justify-self-end rounded-lg px-3 py-2 text-foreground hover:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          Open Aircastle
          <ArrowRightIcon
            aria-hidden="true"
            className="size-5 transition-transform group-hover:translate-x-0.5"
          />
        </Link>
      </nav>
    </header>
  )
}
