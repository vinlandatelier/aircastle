import { useEffect, useRef, useState } from 'react'
import {
  ArrowUpIcon,
  MousePointer2Icon,
  PointerIcon,
  BookOpenIcon,
  BotIcon,
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
import { EditorView } from './editor-view'
import { canute, orchestrator, thorfinn, workingAgents, type DemoAgent } from './agents'
import { usePrefersReducedMotion } from '../use-prefers-reduced-motion'
import styles from './product-demo.module.css'
import {
  frameAt,
  loopDuration,
  prompt,
  stillFrame,
  type CursorShape,
  type CursorTarget,
  type CursorState,
  type Frame,
  type Shortcut,
} from './timeline'

const frameWidth = 1280
const frameHeight = 814

function sameFrame(left: Frame, right: Frame) {
  return (
    left.shortcut === right.shortcut &&
    left.dialog === right.dialog &&
    left.typed === right.typed &&
    left.sendPressed === right.sendPressed &&
    left.agentRow === right.agentRow &&
    left.cursor === right.cursor &&
    left.cursorShape === right.cursorShape &&
    left.view === right.view &&
    left.agentRowHovered === right.agentRowHovered &&
    left.categories === right.categories &&
    left.tags === right.tags &&
    left.writerOnCategories === right.writerOnCategories &&
    left.writerOnTags === right.writerOnTags &&
    left.writerOnBody === right.writerOnBody &&
    left.researchSteps === right.researchSteps &&
    left.cursorTarget === right.cursorTarget &&
    left.researchHovered === right.researchHovered &&
    left.researchPanelOpen === right.researchPanelOpen &&
    left.askMenuOpen === right.askMenuOpen
  )
}

function usePlayback(stage: React.RefObject<HTMLElement | null>, reducedMotion: boolean) {
  const [frame, setFrame] = useState<Frame>(() => frameAt(0))
  useEffect(() => {
    const element = stage.current
    if (reducedMotion || !element) return
    let request: number | undefined
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting || request !== undefined) return
      const startedAt = performance.now()
      const tick = () => {
        const next = frameAt((performance.now() - startedAt) % loopDuration)
        setFrame((current) => (sameFrame(current, next) ? current : next))
        request = requestAnimationFrame(tick)
      }
      request = requestAnimationFrame(tick)
    })
    observer.observe(element)
    return () => {
      observer.disconnect()
      if (request !== undefined) cancelAnimationFrame(request)
    }
  }, [stage, reducedMotion])
  return reducedMotion ? stillFrame : frame
}

function AgentDialog({
  state,
  typed,
  sendPressed,
}: {
  state: Frame['dialog']
  typed: number
  sendPressed: boolean
}) {
  if (state === 'closed') return null
  return (
    <div
      data-demo-dialog
      data-state={state}
      className={cn(
        'absolute top-[182px] left-1/2 z-30 w-[560px] -translate-x-1/2 rounded-xl border bg-popover p-4 text-base text-popover-foreground shadow-2xl transition-[opacity,scale,translate] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] starting:translate-y-2 starting:scale-[0.97] starting:opacity-0',
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
        <span
          data-demo-send
          data-pressed={sendPressed}
          className={cn(
            'inline-flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground',
            sendPressed && styles.sendPress,
          )}
        >
          <ArrowUpIcon className="size-5" />
        </span>
      </div>
    </div>
  )
}

const shortcutKeys: Record<Shortcut, readonly string[]> = {
  'open-agents': ['⌘', 'J'],
  send: ['↵'],
}

function ShortcutChip({ shortcut }: { shortcut: Shortcut | undefined }) {
  const [lastShortcut, setLastShortcut] = useState<Shortcut>('open-agents')
  if (shortcut && shortcut !== lastShortcut) setLastShortcut(shortcut)
  return (
    <div
      data-demo-shortcut
      data-state={shortcut ? 'shown' : 'hidden'}
      className={cn(
        'absolute bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-lg border bg-popover px-2 py-1.5 shadow-lg transition-[opacity,translate] duration-300',
        shortcut ? 'opacity-100' : 'translate-y-2 opacity-0',
      )}
    >
      {shortcutKeys[shortcut ?? lastShortcut].map((key) => (
        <Kbd key={key} className="h-7 min-w-7 text-sm">
          {key}
        </Kbd>
      ))}
    </div>
  )
}

type Status = 'Published' | 'In review' | 'Draft'

const posts: readonly {
  title: string
  body: string
  status: Status
  authors: readonly string[]
  updated: string
}[] = [
  {
    title: 'How we cut build times by 40%',
    body: 'Our CI pipeline had grown to 18 minutes. We profiled every step, cached the slowest ones and split tests across runners. Here is what changed and what it cost us.',
    status: 'Published',
    authors: ['Maya', 'Theo'],
    updated: '2d ago',
  },
  {
    title: 'Designing for offline-first',
    body: 'Users lose signal on trains, in lifts and on flights. We rebuilt sync around a local store so edits never block on the network, and conflicts resolve without prompts.',
    status: 'In review',
    authors: ['Theo'],
    updated: '3d ago',
  },
  {
    title: 'Q3 product roundup',
    body: 'Scheduled publishing, image focal points, field-level permissions and twelve smaller fixes shipped this quarter. Here is a tour of each one with links to the docs.',
    status: 'Published',
    authors: ['Priya', 'Sam', 'Maya'],
    updated: '1w ago',
  },
  {
    title: 'A field guide to content models',
    body: 'Good content models start from how editors work, not from the database. We walk through modelling articles, authors and references for a typical publication.',
    status: 'Draft',
    authors: ['Sam'],
    updated: '1w ago',
  },
  {
    title: 'Why we moved to Postgres',
    body: 'We outgrew our document store once references and uniqueness mattered. This post covers the migration plan, the dual-write period and the queries that got faster.',
    status: 'Published',
    authors: ['Maya'],
    updated: '2w ago',
  },
  {
    title: 'Shipping localisation in a week',
    body: 'Translating fields was the easy part. Locale fallbacks, right-to-left layouts and keeping slugs stable across languages took the rest of the week.',
    status: 'Published',
    authors: ['Theo', 'Priya'],
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

function WindowDots() {
  return (
    <div
      data-demo-window-dots
      className="flex h-8 shrink-0 items-center gap-2 border-b bg-black/[0.04] px-3.5 dark:bg-black/35"
    >
      <span className="size-3 rounded-full bg-muted-foreground/25" />
      <span className="size-3 rounded-full bg-muted-foreground/25" />
      <span className="size-3 rounded-full bg-muted-foreground/25" />
    </div>
  )
}

function AgentMark({ agent, size }: { agent: DemoAgent; size: number }) {
  if (agent === orchestrator)
    return (
      <span
        style={{ width: size, height: size }}
        className="flex shrink-0 items-center justify-center rounded-full bg-foreground text-background"
      >
        <BotIcon className="size-[65%]" />
      </span>
    )
  return <GeneratedAvatar name={agent.name} size={size} variant="beam" />
}

function AskMenu({ open }: { open: boolean }) {
  return (
    <span
      data-demo-ask-menu
      data-state={open ? 'open' : 'closed'}
      className={cn(
        'absolute top-[calc(100%+6px)] right-0 z-50 flex w-72 origin-top-right flex-col rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg transition-[opacity,scale] duration-150 ease-out',
        open ? 'scale-100 opacity-100' : 'pointer-events-none scale-95 opacity-0',
      )}
    >
      {[orchestrator, ...workingAgents].map((agent, index) => (
        <span
          key={agent.name}
          data-demo-ask-option
          className={cn(
            'flex items-center gap-2.5 rounded-md px-2 py-1.5',
            index === 0 && 'bg-accent text-accent-foreground',
          )}
        >
          <AgentMark agent={agent} size={20} />
          <span className="truncate">Ask {agent.name}</span>
          <Badge data-demo-ask-role variant="secondary" className="ml-auto">
            {agent.role}
          </Badge>
        </span>
      ))}
    </span>
  )
}

function AskButton({ menuOpen }: { menuOpen: boolean }) {
  return (
    <span className="relative flex">
      <span data-demo-ask className={cn(outlineButton, 'h-8 gap-2 rounded-r-none pr-1.5 pl-2')}>
        <BotIcon />
        Ask Aircastle
        <Kbd>⌘J</Kbd>
      </span>
      <span
        data-demo-ask-menu-trigger
        className={cn(
          outlineButton,
          'size-8 rounded-l-none border-l-0 transition-colors duration-150',
          menuOpen && 'bg-accent! text-accent-foreground',
        )}
      >
        <ChevronDownIcon
          className={cn('transition-transform duration-150', menuOpen && 'rotate-180')}
        />
      </span>
      <AskMenu open={menuOpen} />
    </span>
  )
}

function DemoHeader({ askMenuOpen }: { askMenuOpen: boolean }) {
  return (
    <div data-demo-header className="relative z-40 flex h-14 shrink-0 items-center gap-2 border-b">
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
        <AskButton menuOpen={askMenuOpen} />
        <span
          data-demo-search
          className="inline-flex h-8 w-60 items-center gap-2.5 rounded-lg bg-secondary pr-2.5 pl-2"
        >
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
    <div data-demo-sidebar className="relative z-30 w-14 shrink-0 border-r">
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
        data-demo-sidebar-trigger
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

const rowGrid = 'grid grid-cols-[14rem_1fr_7rem_8.5rem_5.5rem] items-center gap-4 px-4'

function AgentLabel({ role }: { role: string }) {
  return (
    <span className="rounded-sm bg-white/20 px-1 py-px text-[10px] leading-none text-white">
      {role}
    </span>
  )
}

const cursorSpots = {
  rest: { left: 1010, top: 640 },
  row: { left: 320, top: 218 },
  research: { left: 700, top: 112 },
  ask: { left: 848, top: 56 },
} as const

function DemoCursor({
  state,
  shape,
  target,
}: {
  state: CursorState
  shape: CursorShape
  target: CursorTarget
}) {
  const spot = cursorSpots[target]
  const Shape = shape === 'pointer' ? PointerIcon : MousePointer2Icon
  return (
    <span
      data-demo-cursor
      data-state={state}
      data-shape={shape}
      data-target={target}
      style={{ left: spot.left, top: spot.top }}
      className={cn(
        'absolute z-40 transition-[left,top] duration-[1400ms] ease-[cubic-bezier(0.45,0,0.25,1)]',
      )}
    >
      <Shape
        className={cn(
          'relative size-6 fill-white stroke-black drop-shadow-md transition-[scale] duration-100 ease-out',
          state === 'clicking' && 'scale-90',
        )}
      />
    </span>
  )
}

function AgentRow({ shown, expanded }: { shown: boolean; expanded: boolean }) {
  return (
    <div
      data-demo-row="agent"
      data-state={shown ? 'shown' : 'hidden'}
      data-agents-working="true"
      className={cn(
        'relative z-10 grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
        shown ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
      )}
    >
      <div
        className={cn(
          'min-h-0 transition-[opacity,translate] duration-500 ease-out',
          shown ? 'translate-y-0 opacity-100 delay-150' : '-translate-y-1 opacity-0',
        )}
      >
        <div data-demo-agent-row className={cn(rowGrid, 'relative border-b py-3', styles.agentRow)}>
          <span className="truncate">Introducing Acme MCP</span>
          <span className="truncate text-muted-foreground italic">Agents are drafting…</span>
          <StatusPill status="Draft" />
          <AuthorsCell authors={['Abyan']} />
          <span className="text-muted-foreground">Just now</span>
          <div
            data-demo-agents
            data-expanded={expanded}
            className={cn(
              'absolute top-[calc(100%-3px)] left-3 z-10 flex items-center rounded-b-md px-1.5 pt-[calc(0.25rem+3px)] pb-1 shadow-sm',
              styles.agentTab,
            )}
          >
            <span className="flex -space-x-1.5">
              {workingAgents.map((agent) => (
                <span
                  key={agent.name}
                  data-demo-agent-avatar
                  className={cn('rounded-full', styles.agentAvatar)}
                >
                  <GeneratedAvatar name={agent.name} size={18} variant="beam" />
                </span>
              ))}
            </span>
            <span
              className={cn(
                'grid transition-[grid-template-columns] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
                expanded ? 'grid-cols-[1fr]' : 'grid-cols-[0fr]',
              )}
            >
              <span className="overflow-hidden whitespace-nowrap">
                <span className="inline-flex items-center gap-1.5 pr-1 pl-2 text-xs text-white">
                  <span className="inline-flex items-center gap-1">
                    {thorfinn.name}
                    <span className="inline-flex items-center">
                      <AgentLabel role={thorfinn.role} />,
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    {canute.name}
                    <span className="inline-flex items-center">
                      <AgentLabel role={canute.role} />
                    </span>
                  </span>
                  <span>and 2 others are working</span>
                </span>
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function AuthorsCell({ authors }: { authors: readonly string[] }) {
  return (
    <span
      data-demo-authors={authors.length}
      className="flex min-w-0 items-center gap-2 text-muted-foreground"
    >
      <span className="flex shrink-0 -space-x-1.5">
        {authors.map((author) => (
          <span key={author} className="rounded-full ring-2 ring-card">
            <Initial name={author} />
          </span>
        ))}
      </span>
      <span className="truncate">
        {authors.length === 1 ? authors[0] : `${authors[0]} +${authors.length - 1}`}
      </span>
    </span>
  )
}

function PostsView({
  shown,
  agentRow,
  hovered,
}: {
  shown: boolean
  agentRow: boolean
  hovered: boolean
}) {
  return (
    <div
      data-demo-table
      data-state={shown ? 'shown' : 'hidden'}
      className={cn(
        'absolute inset-0 p-6 transition-[opacity,scale] duration-400 ease-out',
        shown ? 'scale-100 opacity-100' : 'pointer-events-none scale-[0.99] opacity-0',
      )}
    >
      <div className="flex items-center justify-between pb-4">
        <div className="flex items-center gap-2.5">
          <h3 className="text-2xl">Blog posts</h3>
          <Badge data-demo-count variant="secondary">
            {posts.length + (agentRow ? 1 : 0)}
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
          <span>Authors</span>
          <span>Updated</span>
        </div>
        <AgentRow shown={agentRow} expanded={hovered} />
        {posts.map((post) => (
          <div key={post.title} className={cn(rowGrid, 'border-b py-3 last:border-b-0')}>
            <span className="truncate">{post.title}</span>
            <span data-demo-body className="truncate text-muted-foreground">
              {post.body}
            </span>
            <StatusPill status={post.status} />
            <AuthorsCell authors={post.authors} />
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
          inert
          style={{ width: frameWidth, height: frameHeight, scale: String(scale) }}
          className={cn(
            'absolute top-0 left-0 flex origin-top-left flex-col overflow-hidden rounded-[18px] bg-card text-sm text-card-foreground shadow-xl select-none',
            styles.agentPulse,
          )}
        >
          <WindowDots />
          <DemoHeader askMenuOpen={frame.askMenuOpen} />
          <div className="flex h-[calc(100%-5.5rem)]">
            <DemoSidebar />
            <div className="relative min-w-0 flex-1">
              <PostsView
                shown={frame.view === 'table'}
                agentRow={frame.agentRow}
                hovered={frame.agentRowHovered}
              />
              <EditorView
                shown={frame.view === 'editor'}
                categories={frame.categories}
                tags={frame.tags}
                writerOnCategories={frame.writerOnCategories}
                writerOnTags={frame.writerOnTags}
                writerOnBody={frame.writerOnBody}
                researchSteps={frame.researchSteps}
                researchHovered={frame.researchHovered}
                researchPanelOpen={frame.researchPanelOpen}
              />
            </div>
          </div>
          <div
            className={cn(
              'absolute inset-0 z-20 bg-background/30 backdrop-blur-[3px] transition-opacity duration-300',
              frame.dialog === 'open' ? 'opacity-100' : 'opacity-0',
            )}
          />
          <AgentDialog state={frame.dialog} typed={frame.typed} sendPressed={frame.sendPressed} />
          <ShortcutChip shortcut={frame.shortcut} />
          <DemoCursor state={frame.cursor} shape={frame.cursorShape} target={frame.cursorTarget} />
        </div>
      </div>
    </section>
  )
}
