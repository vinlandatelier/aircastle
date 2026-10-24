import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { MenuIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

const navLinks = [
  { label: 'Overview', href: '#overview' },
  { label: 'Our stack', href: '#stack' },
]

export function Header() {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-20 w-full border-b border-border/50 bg-background/95 backdrop-blur-sm">
      <nav
        aria-label="Marketing navigation"
        className="mx-auto flex min-h-16 w-full max-w-5xl items-center justify-between gap-4 px-4"
      >
        <Link
          to="/"
          aria-label="Aircastle home"
          className="rounded-md p-2 focus-visible:outline-2 focus-visible:outline-ring"
        >
          <span aria-hidden="true" className="brand-logo block size-7" />
        </Link>
        <div className="hidden items-center gap-2 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
            >
              {link.label}
            </a>
          ))}
          <Link
            to="/sign-in"
            className="rounded-lg border px-3 py-2 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
          >
            Sign in
          </Link>
          <Link
            to="/sign-in"
            className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/80 focus-visible:outline-2 focus-visible:outline-ring"
          >
            Get started
          </Link>
        </div>
        <div className="md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              render={<Button size="icon" variant="outline" aria-label="Open navigation" />}
            >
              <MenuIcon />
            </SheetTrigger>
            <SheetContent side="top">
              <SheetHeader>
                <SheetTitle>Navigation</SheetTitle>
              </SheetHeader>
              <nav
                aria-label="Mobile marketing navigation"
                className="flex flex-col gap-2 px-4 pb-6"
              >
                {navLinks.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="rounded-lg px-3 py-2 hover:bg-muted"
                  >
                    {link.label}
                  </a>
                ))}
                <Link
                  to="/sign-in"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border px-3 py-2 text-center hover:bg-muted"
                >
                  Sign in
                </Link>
                <Link
                  to="/sign-in"
                  onClick={() => setOpen(false)}
                  className="rounded-lg bg-primary px-3 py-2 text-center text-primary-foreground hover:bg-primary/80"
                >
                  Get started
                </Link>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  )
}
