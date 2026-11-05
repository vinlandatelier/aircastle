import { cn } from 'cn'

const photos: Record<string, string> = { Abyan: '/demo/abyan.jpg' }

/** A person's photo in the preview, or their initial when they have none. */
export function PersonAvatar({ name, className }: { name: string; className?: string }) {
  const photo = photos[name]
  if (photo)
    return (
      <img
        src={photo}
        alt=""
        draggable={false}
        className={cn('inline-block shrink-0 rounded-full object-cover', className)}
      />
    )
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground',
        className,
      )}
    >
      {name.slice(0, 1)}
    </span>
  )
}
