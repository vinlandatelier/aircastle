import { useLayoutEffect, useRef, type ReactNode } from 'react'
import {
  ArrowUpIcon,
  ArrowUpRightIcon,
  ChevronLeftIcon,
  EyeIcon,
  PlusIcon,
  TextQuoteIcon,
} from 'lucide-react'
import { cn } from 'cn'
import { Badge } from '@/components/ui/badge'
import { AgentAvatar } from './agent-avatar'
import { askeladd, canute, einar, orchestrator, thorfinn } from './agents'
import { rewrittenLine } from './body-draft'
import { Confetti } from './confetti'
import { DocsPage, docsTitle, docsUrl } from './docs-preview'
import {
  MainColumn,
  ResearchPanel,
  SideColumn,
  SitePage,
  SitePreview,
  siteUrl,
} from './editor-view'
import { NotificationsBell } from './notifications'
import { Outro } from './outro'
import { PersonAvatar } from './person'
import {
  phoneEditorFieldAt,
  phoneFingerAt,
  phoneFrame,
  phoneReplyToastAt,
  phoneScreenAt,
  phoneSheetAt,
  phoneSiteScrollAt,
  phoneSpots,
} from './phone-story'
import { AuthorsCell, StatusPill } from './posts'
import { posts } from './posts-data'
import { researchLog, researchSources, sourcesReadBy } from './research'
import {
  docsPreviewAt,
  docsPublishedAt,
  docsScrollAt,
  notificationPreviewPressedAt,
  notificationsOpenAt,
  publishedAt,
  unreadNotificationsAt,
} from './site-ask'
import { bodyDraftDuration } from './body-draft'
import { prompt, type Frame } from './timeline'
import styles from './product-demo.module.css'

const statusBarHeight = 32
const appBarHeight = 48
const contextBarHeight = 52

const fingerRadius = 14

const rowAgents = [orchestrator, thorfinn, canute, askeladd, einar] as const

function StatusBar() {
  return (
    <div
      data-phone-status-bar
      className="flex shrink-0 items-center justify-between px-6 text-[13px] font-medium tabular-nums"
      style={{ height: statusBarHeight }}
    >
      <span>9:41</span>
      <span className="flex items-center gap-1.5">
        <span className="flex items-end gap-px">
          {[4, 6, 8, 10].map((height) => (
            <span key={height} className="w-[3px] rounded-[1px] bg-current" style={{ height }} />
          ))}
        </span>
        <span className="relative h-[11px] w-[22px] rounded-[3px] border border-current/40 p-px">
          <span className="block h-full w-4/5 rounded-[1px] bg-current" />
        </span>
      </span>
    </div>
  )
}

function AppBar({ frame }: { frame: Frame }) {
  const askElapsed = frame.previewElapsed
  return (
    <div
      data-phone-app-bar
      className="relative z-40 flex shrink-0 items-center justify-between border-b px-4"
      style={{ height: appBarHeight }}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="brand-logo block size-6 shrink-0" />
        <span className="truncate">Acme Platforms</span>
      </span>
      <span className="flex items-center gap-2">
        <NotificationsBell
          unread={askElapsed === null ? 0 : unreadNotificationsAt(askElapsed)}
          open={askElapsed !== null && notificationsOpenAt(askElapsed)}
          previewPressed={askElapsed !== null && notificationPreviewPressedAt(askElapsed)}
          menuClassName="-right-10 w-[364px]"
        />
        <PersonAvatar name="Abyan" className="size-7" />
      </span>
    </div>
  )
}

function ContextBar({ children }: { children: ReactNode }) {
  return (
    <div
      data-phone-context-bar
      className="flex shrink-0 items-center gap-2 border-b px-3"
      style={{ height: contextBarHeight }}
    >
      {children}
    </div>
  )
}

function PostsScreen({ frame }: { frame: Frame }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between px-4 pt-4 pb-3">
        <span className="flex items-center gap-2">
          <span className="text-xl">Blog posts</span>
          <Badge variant="secondary">{posts.length + (frame.agentRow ? 1 : 0)}</Badge>
        </span>
        <span className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary pr-2.5 pl-2 text-primary-foreground">
          <PlusIcon className="size-4" />
          New
        </span>
      </div>
      <div className="flex flex-col gap-2.5 px-4">
        <div
          className={cn(
            'grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
            frame.agentRow ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
          )}
        >
          <div className="min-h-0">
            <AgentCard
              joined={frame.rowAgents}
              expanded={frame.agentRowHovered}
              shown={frame.agentRow}
            />
          </div>
        </div>
        {posts.map((post) => (
          <div key={post.title} className="flex flex-col gap-2 rounded-lg border px-3.5 py-3">
            <span className="truncate">{post.title}</span>
            <span className="truncate text-muted-foreground">{post.body}</span>
            <span className="flex items-center justify-between gap-2">
              <StatusPill status={post.status} />
              <AuthorsCell authors={post.authors} />
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function AgentCard({
  joined,
  expanded,
  shown,
}: {
  joined: number
  expanded: boolean
  shown: boolean
}) {
  return (
    <div
      data-phone-agent-card
      data-state={shown ? 'shown' : 'hidden'}
      className={cn(
        'relative mb-7 flex flex-col gap-2 rounded-lg border px-3.5 py-3 transition-opacity duration-500',
        styles.agentRow,
        styles.airRow,
        shown ? 'opacity-100 delay-150' : 'opacity-0',
      )}
    >
      <span className="truncate">Introducing Acme MCP</span>
      <span className="truncate text-muted-foreground italic">Agents are drafting…</span>
      <span className="flex items-center justify-between gap-2">
        <StatusPill status="Draft" />
        <AuthorsCell authors={['Abyan']} />
      </span>
      <div
        data-phone-agents
        data-expanded={expanded}
        className={cn(
          'absolute top-[calc(100%-1.5px)] left-3 z-10 flex items-center rounded-b-md px-1.5 pt-[calc(0.25rem+1.5px)] pb-1 shadow-sm',
          styles.agentTab,
        )}
      >
        <span className="flex -space-x-1.5">
          {rowAgents.slice(0, joined).map((agent) => (
            <span
              key={agent.name}
              data-phone-agent-avatar
              className={cn(
                'rounded-full text-neutral-900',
                styles.agentAvatar,
                agent !== orchestrator && styles.avatarJoin,
              )}
            >
              {agent === orchestrator ? (
                <span className="flex size-[18px] items-center justify-center rounded-full bg-black">
                  <span className="air-mascot block size-3 text-white" />
                </span>
              ) : (
                <AgentAvatar agent={agent} size={18} />
              )}
            </span>
          ))}
        </span>
        <span
          className={cn(
            'grid transition-[grid-template-columns] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
            expanded ? 'grid-cols-[1fr]' : 'grid-cols-[0fr]',
          )}
        >
          <span className="overflow-hidden text-xs whitespace-nowrap text-neutral-900">
            <span className="pr-1 pl-2">Air, Thorfinn and 3 others are working</span>
          </span>
        </span>
      </div>
    </div>
  )
}

function AskSheet({ frame }: { frame: Frame }) {
  const open = frame.dialog === 'open'
  return (
    <div
      data-phone-sheet="ask"
      data-state={frame.dialog}
      className={cn(
        'absolute inset-x-0 bottom-0 z-50 flex flex-col gap-3 rounded-t-2xl border-t bg-popover px-4 pt-2.5 pb-6 text-popover-foreground shadow-[0_-12px_40px_-12px_rgb(0_0_0/0.35)] transition-[translate,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] starting:translate-y-full',
        open ? 'translate-y-0' : 'translate-y-full',
      )}
    >
      <span className="mx-auto h-1 w-9 rounded-full bg-muted-foreground/30" />
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="air-mascot block size-4 shrink-0" />
        Ask Air
        <span className="rounded-sm bg-muted px-1 py-px text-[10px] leading-none text-muted-foreground">
          Orchestrator
        </span>
      </span>
      <p className="relative min-h-[4.5rem] text-[17px] leading-7">
        <span data-phone-prompt>{prompt.slice(0, frame.typed)}</span>
        <span
          className={cn(
            'ml-px inline-block h-[1.1em] w-0.5 translate-y-[3px] bg-foreground',
            frame.typed > 0 && frame.typed < prompt.length ? 'opacity-100' : 'animate-pulse',
          )}
        />
        {frame.typed === 0 && (
          <span className="absolute inset-0 pl-1.5 text-muted-foreground/70">
            Describe what you want written, researched or published…
          </span>
        )}
      </p>
      <span className="flex justify-end">
        <span
          data-phone-send
          data-pressed={frame.sendPressed}
          className={cn(
            'inline-flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground',
            frame.sendPressed && styles.sendPress,
          )}
        >
          <ArrowUpIcon className="size-5" />
        </span>
      </span>
    </div>
  )
}

function ResearchStrip({ steps }: { steps: number }) {
  const read = sourcesReadBy(steps)
  const done = steps >= researchLog.length
  const source = researchSources[Math.max(0, read - 1)]
  return (
    <div
      data-phone-research
      data-state={done ? 'done' : 'working'}
      className="flex shrink-0 items-center gap-2 border-b px-4 py-2.5 text-sm"
    >
      <AgentAvatar agent={canute} size={18} />
      <span>{canute.name}</span>
      <span className="truncate text-muted-foreground">
        {done
          ? `researched ${read} sources`
          : read === 0
            ? 'searching…'
            : `reading ${source?.url ?? ''}`}
      </span>
    </div>
  )
}

function useFieldScroll(target: 'top' | 'body' | 'seo') {
  const content = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = content.current
    if (!element) return
    const field =
      target === 'top' ? null : element.querySelector<HTMLElement>(`[data-demo-field="${target}"]`)
    element.style.translate = `0 -${field ? Math.max(0, field.offsetTop - 16) : 0}px`
  }, [content, target])
  return content
}

function EditorScreen({ frame }: { frame: Frame }) {
  const bodyDone = frame.bodyElapsed !== null && frame.bodyElapsed >= bodyDraftDuration
  const target = phoneEditorFieldAt(frame)
  const content = useFieldScroll(target)
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ContextBar>
        <ChevronLeftIcon className="size-5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">Introducing Acme MCP</span>
        <StatusPill status="Draft" />
        <span
          data-phone-preview-button
          className="flex h-8 items-center gap-1.5 rounded-md border bg-background px-2.5 dark:bg-input/30"
        >
          <EyeIcon className="size-4" />
          Preview
        </span>
      </ContextBar>
      <ResearchStrip steps={frame.researchSteps} />
      <div className="relative min-h-0 flex-1 overflow-hidden mask-t-from-[calc(100%-1.5rem)]">
        <div
          ref={content}
          data-phone-fields
          data-target={target}
          className="flex flex-col gap-6 p-4 transition-[translate] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
        >
          <SideColumn
            className="w-full gap-5 rounded-none border-0 p-0"
            writerOnCategories={frame.writerOnCategories}
            writerOnTags={frame.writerOnTags}
            categoriesShown={frame.categories}
            tagsShown={frame.tags}
            cover={frame.cover}
            bodyDone={bodyDone}
          />
          <MainColumn
            writerOnBody={frame.writerOnBody}
            bodyElapsed={frame.bodyElapsed}
            seoElapsed={frame.seoElapsed}
            socialImage={frame.socialImage}
          />
        </div>
      </div>
    </div>
  )
}

function PublishBar({ title, published }: { title: string; published: boolean }) {
  return (
    <ContextBar>
      <ChevronLeftIcon className="size-5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{title}</span>
      <span
        data-phone-status
        className={cn(
          'rounded-full px-2 py-0.5 text-[13px]',
          published
            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            : 'bg-muted text-muted-foreground',
        )}
      >
        {published ? 'Published' : 'Draft'}
      </span>
      <span
        data-phone-publish
        className={cn(
          'flex h-8 items-center rounded-md px-2.5',
          published
            ? 'border bg-background dark:bg-input/30'
            : 'bg-primary text-primary-foreground',
        )}
      >
        {published ? 'Unpublish' : 'Publish'}
      </span>
    </ContextBar>
  )
}

function ReplyToast({ shown }: { shown: boolean }) {
  return (
    <div
      data-phone-reply
      data-state={shown ? 'shown' : 'hidden'}
      className={cn(
        'absolute inset-x-3 bottom-4 z-30 flex flex-col gap-2 rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg transition-[translate,opacity] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)]',
        shown ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0',
      )}
    >
      <span className="flex items-start gap-2">
        <span className="air-mascot mt-1 block size-4 shrink-0" />
        <span className="leading-6">
          Thorfinn rewrote the opening line to lead with a task. Have a look.
        </span>
      </span>
      <span
        data-phone-reference
        className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-xs dark:bg-input/30"
      >
        <TextQuoteIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{rewrittenLine}</span>
        <ArrowUpRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
      </span>
    </div>
  )
}

function SiteScreen({ frame, elapsed }: { frame: Frame; elapsed: number }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PublishBar title="Introducing Acme MCP" published={publishedAt(elapsed)} />
      <div className="relative min-h-0 flex-1">
        <SitePreview url={siteUrl} elapsed={elapsed}>
          <SitePage
            elapsed={elapsed}
            bodyElapsed={frame.bodyElapsed}
            scroll={phoneSiteScrollAt(elapsed)}
          />
        </SitePreview>
        <ReplyToast shown={phoneReplyToastAt(frame)} />
      </div>
    </div>
  )
}

function DocsScreen({ elapsed, docsElapsed }: { elapsed: number; docsElapsed: number }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PublishBar title={docsTitle} published={docsPublishedAt(elapsed)} />
      <div className="relative min-h-0 flex-1">
        <SitePreview key="docs" url={docsUrl} elapsed={docsElapsed}>
          <DocsPage scroll={docsScrollAt(elapsed)} />
        </SitePreview>
      </div>
    </div>
  )
}

function PhoneFinger({ frame }: { frame: Frame }) {
  const { left, top, shown } = phoneFingerAt(frame)
  const pressing = frame.cursor === 'clicking' || frame.cursor === 'dragging'
  return (
    <span
      data-phone-finger
      data-state={frame.cursor}
      data-target={frame.cursorTarget}
      data-shown={shown}
      style={{ translate: `${left - fingerRadius}px ${top - fingerRadius}px` }}
      className={cn(
        'pointer-events-none absolute top-0 left-0 z-[55] size-7 rounded-full border border-white/70 bg-white/35 shadow-[0_2px_10px_rgb(0_0_0/0.25)] backdrop-blur-[1px] transition-[opacity,scale] duration-150',
        shown ? 'opacity-100' : 'opacity-0',
        pressing && 'scale-75 bg-white/55',
      )}
    >
      {frame.cursor === 'clicking' && (
        <span className="absolute inset-0 animate-ping rounded-full border border-white/80" />
      )}
    </span>
  )
}

/** The phone preview: the same story as the desktop preview, laid out the way a phone shows it. */
export function PhoneDemo({ frame, scale }: { frame: Frame; scale: number }) {
  const screen = phoneScreenAt(frame)
  const sheet = phoneSheetAt(frame)
  const elapsed = frame.previewElapsed
  const docsElapsed = elapsed === null ? null : docsPreviewAt(elapsed)
  return (
    <div
      data-demo-frame
      data-demo-phone
      data-phone-screen={screen}
      data-phone-sheet-open={sheet ?? 'none'}
      aria-hidden="true"
      inert
      style={{ width: phoneFrame.width, height: phoneFrame.height, scale: String(scale) }}
      className={cn(
        'absolute top-0 left-0 flex origin-top-left flex-col overflow-hidden rounded-[32px] border bg-card text-sm text-card-foreground shadow-xl select-none',
        styles.agentPulse,
      )}
    >
      <StatusBar />
      <AppBar frame={frame} />
      <div className="relative flex min-h-0 flex-1 flex-col">
        {screen === 'posts' && <PostsScreen frame={frame} />}
        {screen === 'editor' && <EditorScreen frame={frame} />}
        {screen === 'site' && elapsed !== null && <SiteScreen frame={frame} elapsed={elapsed} />}
        {screen === 'docs' && elapsed !== null && docsElapsed !== null && (
          <DocsScreen elapsed={elapsed} docsElapsed={docsElapsed} />
        )}
        <div
          data-phone-backdrop
          className={cn(
            'absolute inset-0 z-40 bg-background/30 backdrop-blur-[3px] transition-opacity duration-300',
            frame.dialog === 'open' ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
        />
        {frame.dialog !== 'closed' && <AskSheet frame={frame} />}
        {screen === 'editor' && (
          <ResearchPanel
            sheet
            open={sheet === 'research'}
            steps={frame.researchSteps}
            askElapsed={null}
          />
        )}
        {screen === 'site' && (
          <ResearchPanel
            sheet
            open={sheet === 'air'}
            steps={frame.researchSteps}
            askElapsed={elapsed}
          />
        )}
      </div>
      {frame.confetti && <Confetti {...frame.confetti} from={phoneSpots.publish} />}
      <PhoneFinger frame={frame} />
      {frame.outroElapsed !== null && (
        <Outro phone elapsed={frame.outroElapsed} opacity={frame.outroOpacity} />
      )}
    </div>
  )
}
