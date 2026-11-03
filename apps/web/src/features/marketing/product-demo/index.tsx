import { useEffect, useRef, useState } from 'react'
import {
  ArrowUpIcon,
  BookOpenIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  MoonIcon,
  PlugIcon,
  PlusIcon,
  SearchIcon,
  SparklesIcon,
  SunIcon,
  type LucideIcon,
} from 'lucide-react'
import { cn } from 'cn'
import { Badge } from '@/components/ui/badge'
import { Kbd } from '@/components/ui/kbd'
import { GeneratedAvatar } from '@/components/shell/generated-avatar'
import { navigationGroups } from '@/features/navigation/pages'
import { usePrefersReducedMotion } from '../use-prefers-reduced-motion'
import { frameAt, loopDuration, prompt, stillFrame, type Frame } from './timeline'

const frameWidth = 1120
const frameHeight = 680
const tickMs = 30

function usePlayback(stage: React.RefObject<HTMLElement | null>, reducedMotion: boolean) {
  const [frame, setFrame] = useState<Frame>(stillFrame)
  useEffect(() => {
    const element = stage.current
    if (reducedMotion || !element) return
    let timer: number | undefined
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting || timer !== undefined) return
      const startedAt = performance.now()
      timer = window.setInterval(
        () => setFrame(frameAt((performance.now() - startedAt) % loopDuration)),
        tickMs,
      )
    })
    observer.observe(element)
    return () => {
      observer.disconnect()
      window.clearInterval(timer)
    }
  }, [stage, reducedMotion])
  return reducedMotion ? stillFrame : frame
}

function AgentDialog({ state, typed }: { state: Frame['dialog']; typed: number }) {
  if (state === 'closed') return null
  return (
    <div
      data-demo-dialog
      data-state={state}
      className={cn(
        'absolute top-[150px] left-1/2 z-30 w-[560px] -translate-x-1/2 rounded-xl border bg-popover p-4 text-base text-popover-foreground shadow-2xl transition-[opacity,scale,translate] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] starting:translate-y-2 starting:scale-[0.97] starting:opacity-0',
        state === 'closing' && 'translate-y-1 scale-[0.98] opacity-0',
      )}
    >
      <p className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground">
        <SparklesIcon className="size-4" />
        Ask agents
      </p>
      <p className="relative min-h-20 text-lg">
        <span data-demo-prompt>{prompt.slice(0, typed)}</span>
        <span
          className={cn(
            'ml-px inline-block h-[1.1em] w-0.5 translate-y-[3px] bg-foreground',
            typed > 0 && typed < prompt.length ? 'opacity-100' : 'animate-pulse',
          )}
        />
        {typed === 0 && (
          <span className="absolute inset-0 pl-1.5 text-muted-foreground/70">
            Describe what you want written, researched or published…
          </span>
        )}
      </p>
      <div className="mt-3 flex items-center justify-end">
        <span className="inline-flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <ArrowUpIcon className="size-5" />
        </span>
      </div>
    </div>
  )
}

function ShortcutChip({ shown }: { shown: boolean }) {
  return (
    <div
      data-demo-shortcut
      data-state={shown ? 'shown' : 'hidden'}
      className={cn(
        'absolute bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-lg border bg-popover px-2 py-1.5 shadow-lg transition-[opacity,translate] duration-300',
        shown ? 'opacity-100' : 'translate-y-2 opacity-0',
      )}
    >
      <Kbd className="h-7 min-w-7 text-sm">⌘</Kbd>
      <Kbd className="h-7 min-w-7 text-sm">J</Kbd>
    </div>
  )
}

type Status = 'Published' | 'In review' | 'Draft'

const posts: readonly {
  title: string
  body: string
  status: Status
  author: string
  updated: string
}[] = [
  {
    title: 'How we cut build times by 40%',
    body: 'Our CI pipeline had grown to 18 minutes. We profiled every step, cached the slowest ones and split tests across runners. Here is what changed and what it cost us.',
    status: 'Published',
    author: 'Maya',
    updated: '2d ago',
  },
  {
    title: 'Designing for offline-first',
    body: 'Users lose signal on trains, in lifts and on flights. We rebuilt sync around a local store so edits never block on the network, and conflicts resolve without prompts.',
    status: 'In review',
    author: 'Theo',
    updated: '3d ago',
  },
  {
    title: 'Q3 product roundup',
    body: 'Scheduled publishing, image focal points, field-level permissions and twelve smaller fixes shipped this quarter. Here is a tour of each one with links to the docs.',
    status: 'Published',
    author: 'Priya',
    updated: '1w ago',
  },
  {
    title: 'A field guide to content models',
    body: 'Good content models start from how editors work, not from the database. We walk through modelling articles, authors and references for a typical publication.',
    status: 'Draft',
    author: 'Sam',
    updated: '1w ago',
  },
  {
    title: 'Why we moved to Postgres',
    body: 'We outgrew our document store once references and uniqueness mattered. This post covers the migration plan, the dual-write period and the queries that got faster.',
    status: 'Published',
    author: 'Maya',
    updated: '2w ago',
  },
  {
    title: 'Shipping localisation in a week',
    body: 'Translating fields was the easy part. Locale fallbacks, right-to-left layouts and keeping slugs stable across languages took the rest of the week.',
    status: 'Published',
    author: 'Theo',
    updated: '3w ago',
  },
]

function useFitScale(stage: React.RefObject<HTMLElement | null>) {
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const element = stage.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setScale(entry.contentRect.width / frameWidth)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [stage])
  return scale
}

function StatusPill({ status }: { status: Status }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 justify-self-start rounded-full px-2.5 py-0.5 text-[13px]',
        status === 'Published' && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        status === 'In review' && 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
        status === 'Draft' && 'bg-muted text-muted-foreground',
      )}
    >
      {status}
    </span>
  )
}

function Initial({ name }: { name: string }) {
  return (
    <span className="inline-flex size-6 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">
      {name.slice(0, 1)}
    </span>
  )
}

const outlineButton =
  'inline-flex shrink-0 items-center justify-center rounded-lg border border-border bg-background bg-clip-padding dark:border-input dark:bg-input/30 [&_svg]:size-4'

const plainIcon =
  'inline-flex size-7 items-center justify-center text-muted-foreground [&_svg]:size-4'

function DemoHeader() {
  return (
    <div data-demo-header className="flex h-14 shrink-0 items-center gap-2 border-b">
      <span className="flex h-full w-14 shrink-0 items-center justify-center border-r">
        <span className="brand-logo block size-6 shrink-0" />
      </span>
      <span className="ml-1 inline-flex h-10 items-center gap-3 px-2">
        <GeneratedAvatar size={24} name="Acme Inc" />
        <span className="flex items-center">
          <span className="flex items-center gap-2">
            Acme Inc
            <Badge variant="secondary">Pro</Badge>
          </span>
          <span className="px-3 text-muted-foreground">/</span>
          Acme Platforms
        </span>
        <ChevronDownIcon className="size-4 text-muted-foreground" />
      </span>
      <span className="flex items-center gap-2">
        <span className={cn(outlineButton, 'h-8 gap-1.5 pr-2.5 pl-2')}>
          <PlugIcon />
          Connect
        </span>
        <span className={cn(outlineButton, 'size-8')}>
          <PlusIcon />
        </span>
      </span>
      <span className="ms-auto flex items-center gap-4 pr-5">
        <span className="inline-flex h-8 w-60 items-center gap-2.5 rounded-lg bg-secondary pr-2.5 pl-2">
          <SearchIcon className="size-4 text-muted-foreground" />
          <span className="text-muted-foreground">Search...</span>
          <Kbd className="ml-auto">⌘K</Kbd>
        </span>
        <span className={plainIcon}>
          <BookOpenIcon />
        </span>
        <span className={plainIcon}>
          <SunIcon className="dark:hidden" />
          <MoonIcon className="hidden dark:block" />
        </span>
        <span className="flex size-8 overflow-hidden rounded-full">
          <GeneratedAvatar name="Shaban Haider" variant="beam" />
        </span>
      </span>
    </div>
  )
}

function DemoSidebar() {
  return (
    <div data-demo-sidebar className="relative w-14 shrink-0 border-r">
      <div className="flex flex-col items-center gap-1 py-4">
        {navigationGroups
          .flatMap<{ title: string; icon: LucideIcon }>((group) => group.items)
          .map((item) => (
            <span
              key={item.title}
              className={cn(
                'inline-flex size-8 items-center justify-center rounded-md',
                item.title === 'Collections'
                  ? 'rounded-sm bg-muted text-foreground'
                  : 'text-muted-foreground',
              )}
            >
              <item.icon className="size-4" />
            </span>
          ))}
      </div>
      <span
        className={cn(
          outlineButton,
          'absolute end-0 top-1/2 z-10 size-7 translate-x-1/2 -translate-y-1/2 rounded-md bg-card! text-muted-foreground',
        )}
      >
        <ChevronRightIcon />
      </span>
    </div>
  )
}

const rowGrid = 'grid grid-cols-[14rem_1fr_7.5rem_7rem_5.5rem] items-center gap-4 px-4'

function PostsView() {
  return (
    <div className="min-w-0 flex-1 p-6">
      <div className="flex items-center justify-between pb-4">
        <div className="flex items-center gap-2.5">
          <h3 className="text-2xl">Blog posts</h3>
          <Badge data-demo-count variant="secondary">
            {posts.length}
          </Badge>
        </div>
        <span className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary pr-2.5 pl-2 text-primary-foreground">
          <PlusIcon className="size-4" />
          New post
        </span>
      </div>
      <div className="overflow-hidden rounded-lg border">
        <div className={cn(rowGrid, 'border-b py-2.5 text-xs text-muted-foreground uppercase')}>
          <span>Title</span>
          <span>Body</span>
          <span>Status</span>
          <span>Author</span>
          <span>Updated</span>
        </div>
        {posts.map((post) => (
          <div key={post.title} className={cn(rowGrid, 'border-b py-3 last:border-b-0')}>
            <span className="truncate">{post.title}</span>
            <span data-demo-body className="truncate text-muted-foreground">
              {post.body}
            </span>
            <StatusPill status={post.status} />
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <Initial name={post.author} />
              {post.author}
            </span>
            <span className="text-muted-foreground">{post.updated}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** A scaled mock of the Aircastle app shown below the hero. */
export function ProductDemo() {
  const stage = useRef<HTMLDivElement>(null)
  const scale = useFitScale(stage)
  const reducedMotion = usePrefersReducedMotion()
  const frame = usePlayback(stage, reducedMotion)

  return (
    <section
      aria-labelledby="product-demo-title"
      className="mx-auto w-full max-w-[85rem] px-4 pb-24"
    >
      <h2 id="product-demo-title" className="sr-only">
        Aircastle preview
      </h2>
      <p className="sr-only">
        The Aircastle dashboard with its sidebar collapsed, showing a blog posts collection. A
        keyboard shortcut opens a dialog for asking agents to do the work.
      </p>
      <div ref={stage} style={{ height: frameHeight * scale }} className="relative w-full">
        <div
          data-demo-frame
          aria-hidden="true"
          style={{ width: frameWidth, height: frameHeight, scale: String(scale) }}
          className="absolute top-0 left-0 flex origin-top-left flex-col overflow-hidden rounded-xl border bg-card text-sm text-card-foreground shadow-xl select-none"
        >
          <DemoHeader />
          <div className="flex h-[calc(100%-3.5rem)]">
            <DemoSidebar />
            <PostsView />
          </div>
          <div
            className={cn(
              'absolute inset-0 z-20 bg-background/30 backdrop-blur-[3px] transition-opacity duration-300',
              frame.dialog === 'open' ? 'opacity-100' : 'opacity-0',
            )}
          />
          <AgentDialog state={frame.dialog} typed={frame.typed} />
          <ShortcutChip shown={frame.shortcut} />
        </div>
      </div>
    </section>
  )
}
