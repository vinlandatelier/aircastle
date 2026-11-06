import { BellIcon, EyeIcon, FileTextIcon } from 'lucide-react'
import { cn } from 'cn'
import styles from './product-demo.module.css'

/** The header's bell, with a red count while notifications are unread and the menu under it while open. */
export function NotificationsBell({
  unread,
  open,
  previewPressed,
}: {
  unread: number
  open: boolean
  previewPressed: boolean
}) {
  return (
    <span className="relative flex">
      <span
        data-demo-notifications
        className={cn(
          'relative inline-flex size-7 items-center justify-center rounded-md text-muted-foreground [&_svg]:size-4',
          open && 'bg-muted text-foreground',
        )}
      >
        <BellIcon />
        {unread > 0 && (
          <span
            data-demo-notification-badge
            className={cn(
              'absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-red-500 text-[10px] leading-none text-white ring-2 ring-card',
              styles.badgePop,
            )}
          >
            {unread}
          </span>
        )}
      </span>
      {open && <NotificationsMenu previewPressed={previewPressed} />}
    </span>
  )
}

function NotificationsMenu({ previewPressed }: { previewPressed: boolean }) {
  return (
    <div
      data-demo-notifications-menu
      className="absolute top-full right-0 mt-2 w-[340px] origin-top-right rounded-xl border bg-popover text-popover-foreground shadow-lg transition-[opacity,scale] duration-200 ease-out starting:scale-95 starting:opacity-0"
    >
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <span>Notifications</span>
        <span className="text-xs text-muted-foreground">Mark all as read</span>
      </div>
      <div className="flex gap-3 p-4">
        <span className="air-mascot mt-0.5 block size-7 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-center justify-between gap-2">
            <span>Docs page ready</span>
            <span className="size-2 rounded-full bg-sky-500" />
          </span>
          <span className="text-muted-foreground">
            Air’s team finished Connect to Acme MCP. It’s ready for your review.
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileTextIcon className="size-3" />
            Docs · just now
          </span>
          <span className="mt-2 flex gap-2">
            <span
              data-demo-notification-action
              className="flex h-7 items-center rounded-md border bg-background px-2.5 dark:bg-input/30"
            >
              Open entry
            </span>
            <span
              data-demo-notification-action
              data-pressed={previewPressed}
              className={cn(
                'flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-primary-foreground [&_svg]:size-3.5',
                previewPressed && styles.sendPress,
              )}
            >
              <EyeIcon />
              Preview
            </span>
          </span>
        </div>
      </div>
    </div>
  )
}
