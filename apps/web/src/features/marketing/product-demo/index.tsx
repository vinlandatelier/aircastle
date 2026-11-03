import { useEffect, useRef, useState } from 'react'
import {
  ArrowUpIcon,
  BookOpenIcon,
  FileTextIcon,
  MousePointer2Icon,
  NewspaperIcon,
  PlusIcon,
  SparklesIcon,
  UsersIcon,
} from 'lucide-react'
import { cn } from 'cn'
import { Kbd } from '@/components/ui/kbd'
import { finalFrame, frameAt, loopDuration, prompt, type Frame } from './timeline'
import { usePrefersReducedMotion } from '../use-prefers-reduced-motion'

const frameWidth = 1120
const frameHeight = 680
const tickMs = 30

const collections = [
  { label: 'Posts', icon: NewspaperIcon, active: true },
  { label: 'Pages', icon: FileTextIcon, active: false },
  { label: 'Authors', icon: UsersIcon, active: false },
  { label: 'Changelog', icon: BookOpenIcon, active: false },
] as const

type Status = 'Published' | 'In review' | 'Draft' | 'Drafting'

const posts: readonly { title: string; status: Status; author: string; updated: string }[] = [
  {
    title: 'How we cut build times by 40%',
    status: 'Published',
    author: 'Maya',
    updated: '2d ago',
  },
  { title: 'Designing for offline-first', status: 'In review', author: 'Theo', updated: '3d ago' },
  { title: 'Q3 product roundup', status: 'Published', author: 'Priya', updated: '1w ago' },
  { title: 'A field guide to content models', status: 'Draft', author: 'Sam', updated: '1w ago' },
  { title: 'Why we moved to Postgres', status: 'Published', author: 'Maya', updated: '2w ago' },
  {
    title: 'Shipping localisation in a week',
    status: 'Published',
    author: 'Theo',
    updated: '3w ago',
  },
]

const cursorSpots = {
  rest: { left: 980, top: 600 },
  send: { left: 800, top: 304 },
} as const

function usePlayback(stage: React.RefObject<HTMLElement | null>, reducedMotion: boolean) {
  const [frame, setFrame] = useState<Frame>(() => frameAt(0))
  useEffect(() => {
    const element = stage.current
    if (reducedMotion || !element) return
    let timer: number | undefined
    const play = () => {
      const startedAt = performance.now()
      timer = window.setInterval(
        () => setFrame(frameAt((performance.now() - startedAt) % loopDuration)),
        tickMs,
      )
    }
    const stop = () => {
      window.clearInterval(timer)
      timer = undefined
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting && timer === undefined) play()
    })
    observer.observe(element)
    return () => {
      observer.disconnect()
      stop()
    }
  }, [stage, reducedMotion])
  return reducedMotion ? finalFrame : frame
}

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
        status === 'Drafting' && 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
      )}
    >
      {status === 'Drafting' && <SparklesIcon className="size-3.5 animate-pulse" />}
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

const rowGrid = 'grid grid-cols-[1fr_9rem_8rem_6rem] items-center gap-4 px-5'

function PostsView({ newPost }: { newPost: boolean }) {
  return (
    <div className="flex h-full">
      <aside className="flex w-56 shrink-0 flex-col gap-1 border-r bg-muted/30 p-3 text-[15px]">
        <div className="mb-3 flex items-center gap-2 px-2 py-1.5">
          <span aria-hidden="true" className="brand-logo block size-5" />
          <span>Acme</span>
        </div>
        <p className="px-2 pb-1 text-xs tracking-wide text-muted-foreground uppercase">
          Collections
        </p>
        {collections.map(({ label, icon: Icon, active }) => (
          <span
            key={label}
            className={cn(
              'flex items-center gap-2.5 rounded-md px-2 py-1.5',
              active ? 'bg-muted text-foreground' : 'text-muted-foreground',
            )}
          >
            <Icon className="size-4" />
            {label}
          </span>
        ))}
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between px-5 pt-6 pb-4">
          <div className="flex items-baseline gap-3">
            <h3 className="text-2xl">Posts</h3>
            <span className="text-muted-foreground">{posts.length + (newPost ? 1 : 0)}</span>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[15px] text-primary-foreground">
            <PlusIcon className="size-4" />
            New post
          </span>
        </header>
        <div className={cn(rowGrid, 'border-y py-2.5 text-[13px] text-muted-foreground uppercase')}>
          <span>Title</span>
          <span>Status</span>
          <span>Author</span>
          <span>Updated</span>
        </div>
        <div
          data-demo-row="new"
          data-state={newPost ? 'shown' : 'hidden'}
          className={cn(
            'grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
            newPost ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
          )}
        >
          <div className="overflow-hidden">
            <div
              className={cn(
                rowGrid,
                'border-b py-3.5 transition-colors duration-1000',
                newPost ? 'bg-violet-500/5' : 'bg-transparent',
              )}
            >
              <span className="truncate">Announcing MCP support</span>
              <StatusPill status="Drafting" />
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <SparklesIcon className="size-4" />
                Agents
              </span>
              <span className="text-muted-foreground">Just now</span>
            </div>
          </div>
        </div>
        {posts.map((post) => (
          <div key={post.title} className={cn(rowGrid, 'border-b py-3.5')}>
            <span className="truncate">{post.title}</span>
            <StatusPill status={post.status} />
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <Initial name={post.author} />
              {post.author}
            </span>
            <span className="text-muted-foreground">{post.updated}</span>
          </div>
        ))}
      </section>
    </div>
  )
}

function PromptDialog({ frame }: { frame: Frame }) {
  if (frame.dialog === 'closed') return null
  const typing = frame.typed < prompt.length
  return (
    <div
      data-demo-dialog
      data-state={frame.dialog}
      className={cn(
        'absolute top-[150px] left-[280px] w-[560px] origin-top rounded-xl border bg-popover p-4 shadow-2xl transition-[translate,scale,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] starting:translate-y-2 starting:scale-[0.97] starting:opacity-0',
        frame.dialog === 'collapsing' &&
          'translate-y-[2px] scale-x-[1.35] scale-y-[0.28] opacity-0 ease-in',
      )}
    >
      <p className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground">
        <SparklesIcon className="size-4" />
        Ask agents
      </p>
      <p className="min-h-20 text-xl leading-snug">
        <span data-demo-prompt>{prompt.slice(0, frame.typed)}</span>
        <span
          aria-hidden="true"
          className={cn(
            'ml-px inline-block h-[1.1em] w-[2px] translate-y-[3px] bg-foreground',
            typing ? 'opacity-100' : 'animate-pulse',
          )}
        />
      </p>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          Agents research, draft and check it for you
        </span>
        <span
          className={cn(
            'inline-flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform duration-150',
            frame.pressed && 'scale-90',
          )}
        >
          <ArrowUpIcon className="size-5" />
        </span>
      </div>
    </div>
  )
}

/** An animated mock of the Aircastle app that plays the agent workflow below the hero. */
export function ProductDemo() {
  const stage = useRef<HTMLDivElement>(null)
  const reducedMotion = usePrefersReducedMotion()
  const frame = usePlayback(stage, reducedMotion)
  const scale = useFitScale(stage)
  const cursor = cursorSpots[frame.cursor]
  const blurred = frame.dialog === 'open'

  return (
    <section
      aria-labelledby="product-demo-title"
      className="mx-auto w-full max-w-[85rem] px-4 pb-24"
    >
      <h2 id="product-demo-title" className="sr-only">
        Aircastle preview
      </h2>
      <p className="mb-4 inline-flex rounded-full border px-3 py-1 text-sm text-muted-foreground">
        Preview
      </p>
      <p className="sr-only">
        A user opens the agent prompt with a shortcut, asks the agents to announce a newly shipped
        MCP feature, and the request appears in the posts collection as a post the agents are
        drafting.
      </p>
      <div ref={stage} style={{ height: frameHeight * scale }} className="relative w-full">
        <div
          data-demo-frame
          aria-hidden="true"
          style={{ width: frameWidth, height: frameHeight, scale: String(scale) }}
          className="absolute top-0 left-0 origin-top-left overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xl select-none"
        >
          <div className="flex h-10 items-center gap-2 border-b px-4">
            <span className="size-3 rounded-full bg-muted-foreground/25" />
            <span className="size-3 rounded-full bg-muted-foreground/25" />
            <span className="size-3 rounded-full bg-muted-foreground/25" />
          </div>
          <div className="relative h-[calc(100%-2.5rem)]">
            <PostsView newPost={frame.newPost} />
            <div
              className={cn(
                'absolute inset-0 bg-background/30 backdrop-blur-[3px] transition-opacity duration-300',
                blurred ? 'opacity-100' : 'pointer-events-none opacity-0',
              )}
            />
            <PromptDialog frame={frame} />
            <div
              className={cn(
                'absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-lg border bg-popover px-2 py-1.5 shadow-lg transition-[opacity,translate] duration-300',
                frame.shortcut ? 'opacity-100' : 'translate-y-2 opacity-0',
              )}
            >
              <Kbd className="h-7 min-w-7 text-sm">⌘</Kbd>
              <Kbd className="h-7 min-w-7 text-sm">J</Kbd>
            </div>
            <MousePointer2Icon
              style={{ left: cursor.left, top: cursor.top }}
              className={cn(
                'absolute size-6 fill-foreground stroke-background drop-shadow-md transition-[left,top,scale] duration-[650ms] ease-[cubic-bezier(0.65,0,0.35,1)]',
                frame.pressed && 'scale-85',
              )}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
