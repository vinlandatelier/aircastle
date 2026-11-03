import { useEffect, useRef, useState } from 'react'
import { BookOpenIcon, FileTextIcon, NewspaperIcon, PlusIcon, UsersIcon } from 'lucide-react'
import { cn } from 'cn'

const frameWidth = 1120
const frameHeight = 680

const collections = [
  { label: 'Posts', icon: NewspaperIcon, active: true },
  { label: 'Pages', icon: FileTextIcon, active: false },
  { label: 'Authors', icon: UsersIcon, active: false },
  { label: 'Changelog', icon: BookOpenIcon, active: false },
] as const

type Status = 'Published' | 'In review' | 'Draft'

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

const rowGrid = 'grid grid-cols-[1fr_9rem_8rem_6rem] items-center gap-4 px-5'

function PostsView() {
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
            <span className="text-muted-foreground">{posts.length}</span>
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

/** A scaled mock of the Aircastle app shown below the hero. */
export function ProductDemo() {
  const stage = useRef<HTMLDivElement>(null)
  const scale = useFitScale(stage)

  return (
    <section
      aria-labelledby="product-demo-title"
      className="mx-auto w-full max-w-[85rem] px-4 pb-24"
    >
      <h2 id="product-demo-title" className="sr-only">
        Aircastle preview
      </h2>
      <p className="sr-only">
        A posts collection in Aircastle, listing posts with their status, author and last update.
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
            <PostsView />
          </div>
        </div>
      </div>
    </section>
  )
}
