import { cn } from 'cn'
import { PersonAvatar } from './person'
import type { Status } from './posts-data'

/** A post's workflow status as a coloured pill. */
export function StatusPill({ status }: { status: Status }) {
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

/** A post's authors as stacked avatars and a name. */
export function AuthorsCell({ authors }: { authors: readonly string[] }) {
  return (
    <span
      data-demo-authors={authors.length}
      className="flex min-w-0 items-center gap-2 text-muted-foreground"
    >
      <span className="flex shrink-0 -space-x-1.5">
        {authors.map((author) => (
          <span key={author} className="rounded-full ring-2 ring-card">
            <PersonAvatar name={author} className="size-6 text-xs" />
          </span>
        ))}
      </span>
      <span className="truncate">
        {authors.length === 1 ? authors[0] : `${authors[0]} +${authors.length - 1}`}
      </span>
    </span>
  )
}
