import { useLayoutEffect, useRef, type ReactNode } from 'react'
import {
  ChevronDownIcon,
  ChevronRightIcon,
  SparklesIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  ShareIcon,
  XIcon,
  ArrowUpRightIcon,
  CheckIcon,
  BrainIcon,
  LoaderCircleIcon,
  MessageCircleQuestionIcon,
  TriangleAlertIcon,
  TextQuoteIcon,
  CircleCheckIcon,
  EllipsisVerticalIcon,
  ExternalLinkIcon,
  EyeIcon,
  GlobeLockIcon,
  RotateCwIcon,
  BoldIcon,
  CalendarIcon,
  CodeIcon,
  Heading2Icon,
  ImageIcon,
  ItalicIcon,
  Link2Icon,
  LinkIcon,
  ListIcon,
  PlusIcon,
  type LucideIcon,
} from 'lucide-react'
import { SiMarkdown, SiModelcontextprotocol } from '@icons-pack/react-simple-icons'
import { cn } from 'cn'
import styles from './product-demo.module.css'
import {
  docsDecision,
  docsDecisionState,
  researchBrief,
  researchLog,
  researchSources,
  sourcesReadBy,
  type Artifact,
  type ResearchEntry,
} from './research'
import { askeladd, canute, einar, orchestrator, thorfinn, thorkell, type DemoAgent } from './agents'
import { DocsPage, docsTitle, docsUrl } from './docs-preview'
import { MentionText } from './mention'
import { AgentAvatar } from './agent-avatar'
import { PersonAvatar } from './person'
import { prompt, seoTiming, type CoverState } from './timeline'
import {
  bodyDraftDuration,
  bodyDraftTimed,
  bodyReadingTime,
  openingLine,
  rewrittenLine,
  openingRest,
  type DraftSegment,
} from './body-draft'
import {
  askEnterPressedAt,
  askInstruction,
  askOpenAt,
  askTiming,
  askTypedAt,
  docsPreviewAt,
  docsPublishedAt,
  docsScrollAt,
  publishedAt,
  revisedFlashAt,
  rewrittenWordsAt,
  selectedCharsAt,
  siteScrollAt,
} from './site-ask'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Message, MessageContent, MessageHeader } from '@/components/ui/message'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from '@/components/ui/input-group'
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from '@/components/ui/trace'
import { Badge } from '@/components/ui/badge'
import { GeneratedAvatar } from '@/components/shell'

const control = 'flex h-9 items-center rounded-md border bg-background px-3 dark:bg-input/30'

const placeholder = 'text-muted-foreground/60'

const categories = ['Product', 'Announcements'] as const
const tags = ['MCP', 'AI', 'Integrations'] as const

const toolbar: readonly (readonly { name: string; icon: LucideIcon }[])[] = [
  [{ name: 'heading', icon: Heading2Icon }],
  [
    { name: 'bold', icon: BoldIcon },
    { name: 'italic', icon: ItalicIcon },
    { name: 'link', icon: LinkIcon },
  ],
  [
    { name: 'list', icon: ListIcon },
    { name: 'code', icon: CodeIcon },
    { name: 'image', icon: ImageIcon },
  ],
]

function Field({
  name,
  label,
  empty,
  aside,
  hint,
  children,
}: {
  name: string
  label: string
  empty: boolean
  aside?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div data-demo-field={name} data-empty={empty} className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        {aside && <span className="tabular-nums">{aside}</span>}
      </div>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  )
}

function Chip({ children, arrived }: { children: React.ReactNode; arrived?: boolean }) {
  return (
    <Badge
      data-demo-chip
      variant="secondary"
      className={cn('h-6 gap-1.5 px-2 text-xs', arrived && styles.agentArrive)}
    >
      {children}
    </Badge>
  )
}

function agentHue(agent: DemoAgent) {
  return { '--agent-base': agent.colour } as React.CSSProperties
}

function AgentPresence({
  agent,
  active,
  status,
}: {
  agent: DemoAgent
  active: boolean
  status?: string
}) {
  return (
    <>
      <span
        data-demo-agent-outline
        data-active={active}
        style={agentHue(agent)}
        className={cn(
          'pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-500',
          styles.agentField,
          active ? 'opacity-100' : 'opacity-0',
        )}
      />
      <AgentTab agent={agent} active={active} status={status} />
    </>
  )
}

function AgentTab({
  agent,
  active,
  status,
}: {
  agent: DemoAgent
  active: boolean
  status: string | undefined
}) {
  return (
    <div
      data-demo-agent-tab
      data-active={active}
      style={agentHue(agent)}
      className={cn(
        'absolute right-2 bottom-[calc(100%-1.5px)] z-10 flex items-center gap-1.5 rounded-t-md px-1.5 pt-1 pb-[calc(0.25rem+1.5px)] text-xs whitespace-nowrap text-white transition-[opacity,translate] duration-500',
        styles.agentTab,
        active ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0',
      )}
    >
      <span className={cn('rounded-full', styles.agentAvatar)}>
        <AgentAvatar agent={agent} size={16} />
      </span>
      {agent.name}
      <span className="rounded-sm bg-white/20 px-1 py-px text-[10px] leading-none">
        {agent.role}
      </span>
      {status && (
        <>
          <span className="text-white/60">·</span>
          <span className="text-white/80">{status}</span>
        </>
      )}
    </div>
  )
}

function Multiselect({
  agent,
  agentActive = false,
  empty,
  placeholderText,
  children,
}: {
  agent?: DemoAgent
  agentActive?: boolean
  empty: boolean
  placeholderText: string
  children?: React.ReactNode
}) {
  return (
    <div
      data-demo-multiselect
      data-agent={agent?.name}
      className={cn(
        'relative flex min-h-9 items-start gap-1.5 rounded-md border bg-background p-1.5 dark:bg-input/30',
        'transition-[border-color] duration-500',
        agentActive && 'border-transparent',
      )}
    >
      <div className="flex min-h-6 min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {empty ? (
          <span className="px-1.5 text-muted-foreground/60">{placeholderText}</span>
        ) : (
          children
        )}
      </div>
      <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground">
        <PlusIcon className="size-4" />
      </span>
      {agent && <AgentPresence agent={agent} active={agentActive} />}
    </div>
  )
}

const writerAgent = thorfinn
const researcher = canute.name

function MediaPlaceholder({ hint, className }: { hint: string; className?: string }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-1.5 rounded-md border border-dashed bg-muted/40 text-muted-foreground',
        className,
      )}
    >
      <ImageIcon className="size-5" />
      <span className="text-xs">{hint}</span>
    </div>
  )
}

/** Canute's research status chip: the source being read, then the number researched. */
function ResearchStatus({
  steps,
  hovered,
  docked,
}: {
  steps: number
  hovered: boolean
  docked: boolean
}) {
  const sourcesRead = sourcesReadBy(steps)
  const currentIndex = sourcesRead - 1
  const state = steps >= researchLog.length ? 'done' : docked ? 'docked' : 'working'
  const done = state !== 'working'
  return (
    <span
      data-demo-research
      data-state={state}
      data-sources={sourcesRead}
      data-hovered={hovered}
      className={cn(
        'grid transition-[grid-template-columns,opacity,margin,scale] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
        done ? '-mr-2 scale-95 grid-cols-[0fr] opacity-0' : 'grid-cols-[1fr] opacity-100',
      )}
    >
      <span className="min-w-0 overflow-hidden">
        <span
          className={cn(
            'flex h-8 w-max items-center gap-2 rounded-md pr-2.5 pl-1.5 transition-colors duration-200',
            hovered ? 'bg-muted' : 'bg-muted/60',
          )}
        >
          <AgentAvatar agent={canute} size={18} />
          <span>{researcher}</span>
          <span className="rounded-sm bg-foreground/[0.06] px-1 py-px text-[10px] leading-none text-muted-foreground">
            {canute.role}
          </span>
          <span className="text-muted-foreground">
            {sourcesRead === 0 ? 'searching' : 'reading'}
          </span>
          <span className="relative h-5 w-[230px] overflow-hidden">
            {researchSources.map(({ url, logo: Logo }, index) => (
              <span
                key={url}
                data-demo-source
                data-state={
                  index < currentIndex ? 'read' : index === currentIndex ? 'current' : 'queued'
                }
                className={cn(
                  'absolute inset-0 flex items-center gap-1.5 leading-5 transition-[translate,opacity] duration-350 ease-[cubic-bezier(0.22,1,0.36,1)]',
                  index < currentIndex && '-translate-y-full opacity-0',
                  index === currentIndex && 'translate-y-0 opacity-100',
                  index > currentIndex && 'translate-y-full opacity-0',
                )}
              >
                <span data-demo-source-logo className="flex shrink-0">
                  <Logo className="size-3.5" />
                </span>
                <span data-demo-source-url className="truncate">
                  {url}
                </span>
              </span>
            ))}
          </span>
        </span>
      </span>
    </span>
  )
}

const entering =
  'transition-[opacity,translate] duration-500 starting:translate-y-1 starting:opacity-0'

function ResearchEntryView({ entry, answered }: { entry: ResearchEntry; answered: boolean }) {
  if (entry.kind === 'thought')
    return (
      <p
        data-demo-thought
        className={cn('line-clamp-2 text-xs leading-5 text-muted-foreground italic', entering)}
      >
        {entry.text}
      </p>
    )
  if (entry.kind === 'source') {
    const { url, logo: Logo, action, finding, gap } = entry.source
    return (
      <div className={cn('flex flex-col gap-1', entering)}>
        <TraceLine data-demo-research-step className="text-xs">
          <TraceIcon>
            <Logo className="size-3.5" />
          </TraceIcon>
          <TraceTitle>
            {action} {url}
          </TraceTitle>
        </TraceLine>
        <p
          className={cn(
            'flex gap-1.5 pl-6 text-xs leading-5 text-foreground',
            gap && 'text-amber-600 dark:text-amber-400',
          )}
        >
          {gap && <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />}
          {finding}
        </p>
      </div>
    )
  }
  if (entry.kind === 'decision')
    return (
      <TraceLine data-demo-decision-marker className={cn('text-xs', entering)}>
        <TraceIcon>
          <MessageCircleQuestionIcon className="size-3.5" />
        </TraceIcon>
        <TraceTitle className="whitespace-normal">
          Asked you: {entry.question.charAt(0).toLowerCase() + entry.question.slice(1)}
        </TraceTitle>
        {answered ? (
          <span className="shrink-0 rounded-sm bg-emerald-500/15 px-1 py-px text-[10px] leading-none text-emerald-700 dark:text-emerald-300">
            You: {docsDecision.chosen}
          </span>
        ) : (
          <span className="shrink-0 rounded-sm bg-amber-500/15 px-1 py-px text-[10px] leading-none text-amber-700 dark:text-amber-300">
            Waiting
          </span>
        )}
      </TraceLine>
    )
  if (entry.kind === 'handoff')
    return (
      <TraceLine data-demo-handoff className={cn('text-xs text-foreground', entering)}>
        <TraceIcon>
          <ArrowUpRightIcon className="size-3.5" />
        </TraceIcon>
        <TraceTitle className="whitespace-normal">
          <MentionText text={`Handed off to @${entry.to}: ${entry.task}`} />
        </TraceTitle>
      </TraceLine>
    )
  return (
    <TraceLine className={cn('text-xs', entering)}>
      <TraceIcon>
        <SparklesIcon className="size-3.5" />
      </TraceIcon>
      <TraceTitle>Synthesised findings</TraceTitle>
    </TraceLine>
  )
}

function PendingStep({ entry }: { entry: ResearchEntry }) {
  const text =
    entry.kind === 'thought' || entry.kind === 'decision' || entry.kind === 'handoff'
      ? 'Thinking…'
      : entry.kind === 'source'
        ? `${entry.source.action === 'Read' ? 'Reading' : 'Searching'} ${entry.source.url}`
        : 'Synthesising findings…'
  return (
    <TraceLine data-demo-research-pending status="running" className="text-xs">
      <TraceIcon>
        {entry.kind === 'thought' || entry.kind === 'decision' || entry.kind === 'handoff' ? (
          <BrainIcon className="size-3.5" />
        ) : (
          <LoaderCircleIcon className="size-3.5 motion-safe:animate-spin" />
        )}
      </TraceIcon>
      <TraceTitle>{text}</TraceTitle>
    </TraceLine>
  )
}

const keepOpenState = () => {}

function ResearchChain({ steps }: { steps: number }) {
  const next = researchLog[steps]
  return (
    <Trace data-demo-research-chain>
      <TraceCollapsible open={next !== undefined} onOpenChange={keepOpenState}>
        <TraceCollapsibleTrigger>
          <TraceLine {...(next && { status: 'running' })}>
            <TraceIcon>
              {next ? (
                <LoaderCircleIcon className="motion-safe:animate-spin" />
              ) : (
                <CircleCheckIcon />
              )}
            </TraceIcon>
            <TraceTitle>
              {next ? 'Researching' : `Researched ${researchSources.length} sources`}
            </TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent keepMounted>
          <Trace className="gap-3">
            {researchLog.slice(0, steps).map((entry) => (
              <ResearchEntryView
                key={entry.at}
                entry={entry}
                answered={docsDecisionState(steps) === 'sent'}
              />
            ))}
            {next && <PendingStep entry={next} />}
          </Trace>
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  )
}

const replyText =
  'Here’s what I found, with the setup steps and sources for the post. Acme’s docs don’t cover MCP yet, so I’ve handed a docs page to @Air.'
const replyWords = replyText.split(' ')
const wordInterval = 35
const cardsStartAfter = replyWords.length * wordInterval + 150
const cardInterval = 120

function ResearchReply({ artifacts }: { artifacts: readonly Artifact[] }) {
  return (
    <div data-demo-research-reply className="flex flex-col gap-2.5">
      <p className="leading-relaxed">
        {replyWords.map((word, index) => (
          <span
            key={index}
            data-demo-reply-word
            className={styles.streamWord}
            style={{ animationDelay: `${index * wordInterval}ms` }}
          >
            <MentionText text={index < replyWords.length - 1 ? `${word} ` : word} />
          </span>
        ))}
      </p>
      {artifacts.map((artifact, index) => (
        <span
          key={artifact.name}
          data-demo-artifact
          style={{ animationDelay: `${cardsStartAfter + index * cardInterval}ms` }}
          className={cn(
            'flex items-center gap-3 rounded-lg border bg-background px-3 py-2.5 dark:bg-input/30',
            styles.streamCard,
          )}
        >
          <SiMarkdown data-demo-artifact-icon className="size-5 shrink-0 text-muted-foreground" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span>{artifact.name}</span>
            <span data-demo-artifact-summary className="truncate text-xs text-muted-foreground">
              {artifact.summary}
            </span>
          </span>
          <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
        </span>
      ))}
    </div>
  )
}

const synthesis = researchLog.find((entry) => entry.kind === 'synthesis')

function AskingCard() {
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-lg border bg-background p-3 shadow-sm dark:bg-input/30',
        entering,
      )}
    >
      <MessageCircleQuestionIcon className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div className="flex flex-col gap-1">
          <span data-demo-decision-question>{docsDecision.question}</span>
          <span className="text-xs leading-5 text-muted-foreground">{docsDecision.reason}</span>
        </div>
        <span
          data-demo-decision-target
          className="flex w-fit items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs"
        >
          <span className="text-muted-foreground">{docsDecision.target.collection}</span>
          <ChevronRightIcon className="size-3 text-muted-foreground" />
          {docsDecision.target.title}
        </span>
        <span className="flex flex-col gap-1">
          {docsDecision.replies.map((reply, index) => (
            <span
              key={reply}
              data-demo-decision-option
              className={cn(
                'flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs',
                index === docsDecision.replies.length - 1 && 'text-muted-foreground',
              )}
            >
              <span className="text-[10px] text-muted-foreground tabular-nums">{index + 1}</span>
              {reply}
            </span>
          ))}
        </span>
      </div>
    </div>
  )
}

function SentReceipt() {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs shadow-sm dark:bg-input/30">
      <AgentAvatar agent={canute} size={16} />
      <span className="min-w-0 truncate">
        <MentionText text={`Sent to @${orchestrator.name}: draft ${docsDecision.target.title}`} />
      </span>
      <CheckIcon className="ml-auto size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
    </div>
  )
}

function DecisionCard({ state }: { state: 'asking' | 'sent' }) {
  return (
    <div
      data-demo-decision
      data-state={state}
      className={cn('grid', state === 'sent' && styles.receiptLeave)}
    >
      <div className="min-h-0 overflow-hidden">
        {state === 'asking' ? <AskingCard /> : <SentReceipt />}
      </div>
    </div>
  )
}

function AgentByline({ agent, dim = false }: { agent: DemoAgent; dim?: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn('flex', dim && 'opacity-70')}>
        <AgentAvatar agent={agent} size={16} />
      </span>
      <span data-demo-thread-name className={cn(!dim && 'text-foreground')}>
        {agent.name}
      </span>
      <span className="rounded-sm bg-muted px-1 py-px text-[10px] leading-none">{agent.role}</span>
    </span>
  )
}

function ThreadMessage({ agent, children }: { agent: DemoAgent; children: React.ReactNode }) {
  return (
    <div data-demo-thread-message className={cn('flex flex-col gap-1', entering)}>
      <AgentByline agent={agent} dim />
      <div data-demo-thread-text className="pl-[22px] text-xs leading-5 text-muted-foreground">
        {children}
      </div>
    </div>
  )
}

function UserMessage({ quote, children }: { quote?: string; children: React.ReactNode }) {
  return (
    <Message
      data-demo-chat-message
      data-from="user"
      align="end"
      className={cn('shrink-0', entering)}
    >
      <MessageContent className="items-end gap-1.5">
        {quote && (
          <span
            data-demo-chat-quote
            className="line-clamp-2 max-w-[92%] border-l-2 pl-2 text-xs leading-5 text-muted-foreground"
          >
            {quote}
          </span>
        )}
        <Bubble align="end" variant="muted" className="max-w-[92%]">
          <BubbleContent>{children}</BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  )
}

function AirMessage({ children }: { children: React.ReactNode }) {
  return (
    <Message data-demo-chat-message data-from="air" className={cn('shrink-0', entering)}>
      <MessageContent>
        <p className="leading-relaxed">{children}</p>
      </MessageContent>
    </Message>
  )
}

const airReply = 'Thorfinn rewrote the opening line to lead with a task. Have a look.'

function AirChat({ elapsed }: { elapsed: number }) {
  const t = askTiming
  const rewriting = elapsed >= t.rewriteStarts && elapsed < t.rewriteEnds
  return (
    <>
      <UserMessage>{prompt}</UserMessage>
      <AirMessage>
        <MentionText text="On it. @Thorfinn is drafting the post, @Canute is researching, @Askeladd has SEO and @Einar is making the cover." />
      </AirMessage>
      <UserMessage quote={openingLine}>{askInstruction}</UserMessage>
      {elapsed < t.thinkingEnds ? (
        <TraceLine
          data-demo-chat-thinking
          status="running"
          className={cn('shrink-0 text-xs', entering)}
        >
          <TraceIcon>
            <BrainIcon className="size-3.5" />
          </TraceIcon>
          <TraceTitle>Thinking…</TraceTitle>
        </TraceLine>
      ) : (
        <div className="flex shrink-0 flex-col gap-2.5">
          <TraceLine data-demo-delegation className={cn('text-xs text-foreground', entering)}>
            <TraceIcon>
              <ArrowUpRightIcon className="size-3.5" />
            </TraceIcon>
            <TraceTitle className="whitespace-normal">
              <MentionText text={`Asked @${thorkell.name} to review the opening line`} />
            </TraceTitle>
          </TraceLine>
          <div className="ml-[7px] flex flex-col gap-2.5 border-l pl-3.5">
            {elapsed >= t.reviewNoted && (
              <ThreadMessage agent={thorkell}>
                <MentionText text="It opens on how MCP works. Lead with a task a team would ask for, and keep the permissions point. @Thorfinn, over to you." />
              </ThreadMessage>
            )}
            {elapsed >= t.rewriteStarts && (
              <ThreadMessage agent={thorfinn}>
                {rewriting ? (
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <LoaderCircleIcon className="size-3.5 motion-safe:animate-spin" />
                    Rewriting the opening line…
                  </span>
                ) : (
                  'Rewrote it to open on a task.'
                )}
              </ThreadMessage>
            )}
            {elapsed >= t.approved && (
              <ThreadMessage agent={thorkell}>Reads well. Approved.</ThreadMessage>
            )}
          </div>
          {elapsed >= t.finished && (
            <TraceLine data-demo-review-finished className={cn('text-xs', entering)}>
              <TraceIcon>
                <CircleCheckIcon className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              </TraceIcon>
              <TraceTitle>{thorkell.name} finished reviewing</TraceTitle>
            </TraceLine>
          )}
        </div>
      )}
      {elapsed >= t.replied && (
        <AirMessage>
          {airReply.split(' ').map((word, index, words) => (
            <span
              key={index}
              className={styles.streamWord}
              style={{ animationDelay: `${index * wordInterval}ms` }}
            >
              {index < words.length - 1 ? `${word} ` : word}
            </span>
          ))}
          <span
            data-demo-chat-reference
            className={cn(
              'mt-2 flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-xs dark:bg-input/30',
              styles.streamCard,
            )}
            style={{ animationDelay: `${airReply.split(' ').length * wordInterval}ms` }}
          >
            <TextQuoteIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{rewrittenLine}</span>
            <ArrowUpRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
          </span>
        </AirMessage>
      )}
    </>
  )
}

/** The agent chat: Canute's research and decision, then Air's thread once a line is asked about. On phones it rises as a bottom sheet. */
export function ResearchPanel({
  open,
  steps,
  askElapsed,
  sheet = false,
}: {
  open: boolean
  steps: number
  askElapsed: number | null
  sheet?: boolean
}) {
  const done = steps >= researchLog.length
  const airChat = askElapsed !== null && askElapsed >= askTiming.sent
  const chatAgent = airChat ? orchestrator : canute

  return (
    <div
      data-demo-research-panel
      data-state={open ? 'open' : 'closed'}
      className={cn(
        'absolute z-30 flex flex-col bg-card transition-[translate,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
        sheet
          ? 'inset-x-0 top-[38%] bottom-0 rounded-t-2xl border-t shadow-[0_-12px_40px_-12px_rgb(0_0_0/0.35)]'
          : 'top-0 right-0 bottom-0 w-[340px] border-l',
        open
          ? 'translate-0 opacity-100'
          : sheet
            ? 'pointer-events-none translate-y-[calc(100%+4rem)]'
            : 'pointer-events-none translate-x-full opacity-0',
      )}
    >
      <div
        data-demo-panel-header
        className="flex h-14 shrink-0 items-center justify-between border-b px-4"
      >
        <div
          data-demo-agent-switcher
          className="-ml-1.5 flex min-w-0 items-center gap-2 rounded-md py-1 pr-1 pl-1.5 whitespace-nowrap"
        >
          <span data-demo-panel-avatar className="flex rounded-full">
            {airChat ? (
              <span className="air-mascot block size-[22px]" />
            ) : (
              <AgentAvatar agent={canute} size={22} />
            )}
          </span>
          <span>{chatAgent.name}</span>
          <span
            data-demo-agent-label
            className="rounded-sm bg-muted px-1 py-px text-[10px] leading-none text-muted-foreground"
          >
            {chatAgent.role}
          </span>
          <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
        </div>
        <EllipsisVerticalIcon className="size-4 text-muted-foreground" />
      </div>
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col justify-end gap-4 overflow-hidden p-4',
          sheet && 'mask-t-from-[calc(100%-2rem)]',
        )}
      >
        {airChat ? (
          <AirChat elapsed={askElapsed} />
        ) : (
          <>
            <Message align="end" className="shrink-0">
              <MessageContent className="gap-1.5">
                <MessageHeader
                  data-demo-research-sender
                  className="gap-1.5 px-0 text-muted-foreground"
                >
                  <span className="air-mascot block size-4 shrink-0" />
                  {orchestrator.name}
                  <span className="rounded-sm bg-muted px-1 py-px text-[10px] leading-none">
                    {orchestrator.role}
                  </span>
                </MessageHeader>
                <Bubble
                  align="end"
                  variant="muted"
                  data-demo-research-request
                  className="max-w-[92%]"
                >
                  <BubbleContent className="flex flex-col gap-1.5">
                    <p>
                      <MentionText text={researchBrief.goal} />
                    </p>
                    <p>The post should cover:</p>
                    <ul className="list-disc pl-4">
                      {researchBrief.covers.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                    <p>{researchBrief.scope}</p>
                  </BubbleContent>
                </Bubble>
              </MessageContent>
            </Message>
            <Message className="shrink-0">
              <MessageContent className="gap-4">
                <ResearchChain steps={steps} />
                {done && synthesis?.kind === 'synthesis' && (
                  <ResearchReply artifacts={synthesis.artifacts} />
                )}
              </MessageContent>
            </Message>
          </>
        )}
      </div>
      <div className={cn('flex flex-col gap-2 p-3', sheet && 'pb-6')}>
        {!airChat && docsDecisionState(steps) !== 'unasked' && (
          <DecisionCard state={docsDecisionState(steps) === 'sent' ? 'sent' : 'asking'} />
        )}
        <InputGroup data-demo-research-prompt className="dark:bg-input/30">
          <InputGroupTextarea
            readOnly
            tabIndex={-1}
            rows={1}
            placeholder={
              sheet ? 'Ask anything…' : 'Ask anything, @tag documents, or / for commands'
            }
            className="min-h-0 p-3"
          />
          <InputGroupAddon align="block-end" className="justify-end">
            <InputGroupButton
              size="icon-xs"
              variant="default"
              tabIndex={-1}
              className="rounded-full"
              aria-label="Send"
            >
              <ArrowUpIcon />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </div>
    </div>
  )
}

function TopBar({
  steps,
  researchHovered,
  researchDocked,
  previewing,
  published,
  collection,
  title,
}: {
  steps: number
  researchHovered: boolean
  researchDocked: boolean
  previewing: boolean
  published: boolean
  collection: string
  title: string
}) {
  return (
    <div
      data-demo-top-bar
      className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between gap-4 border-b bg-card px-6"
    >
      <div data-demo-breadcrumb className="flex min-w-0 items-center gap-2 whitespace-nowrap">
        <span className="text-muted-foreground">{collection}</span>
        <span className="text-muted-foreground">/</span>
        <span className="truncate">{title}</span>
        <span
          data-demo-post-status
          className={cn(
            'rounded-full px-2 py-0.5 text-[13px]',
            published
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'bg-muted text-muted-foreground',
          )}
        >
          {published ? 'Published' : 'Draft'}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <ResearchStatus steps={steps} hovered={researchHovered} docked={researchDocked} />
        <span className="flex">
          <span
            data-demo-preview
            className="flex h-8 items-center gap-1.5 rounded-md rounded-r-none border bg-background pr-3 pl-2.5 dark:bg-input/30"
          >
            {previewing ? <XIcon className="size-4" /> : <EyeIcon className="size-4" />}
            {previewing ? 'Close Preview' : 'Preview'}
          </span>
          <span
            data-demo-preview-external
            className="flex size-8 items-center justify-center rounded-md rounded-l-none border border-l-0 bg-background dark:bg-input/30"
          >
            <ExternalLinkIcon className="size-4" />
          </span>
        </span>
        <span
          data-demo-publish
          className={cn(
            'flex h-8 items-center rounded-md px-3',
            published
              ? 'border bg-background dark:bg-input/30'
              : 'bg-primary text-primary-foreground',
          )}
        >
          {published ? 'Unpublish' : 'Publish'}
        </span>
      </div>
    </div>
  )
}

function DraftWords({ segments }: { segments: DraftSegment[] }) {
  return segments.map(({ text }, index) => {
    const code = /^`([^`]+)`(.*)$/s.exec(text)
    return (
      <span key={index} data-demo-draft-word className={styles.streamWord}>
        {code ? (
          <>
            <code className="rounded-sm bg-muted px-1 font-mono text-[0.85em]">{code[1]}</code>
            {code[2]}
          </>
        ) : (
          text
        )}
      </span>
    )
  })
}

function BodyDraft({ elapsed }: { elapsed: number }) {
  return (
    <div data-demo-body-viewport className="relative h-72 overflow-hidden">
      <div data-demo-body-draft className="flex flex-col gap-2.5 px-4 py-4 leading-6">
        <DraftBlocks elapsed={elapsed} />
      </div>
    </div>
  )
}

function DraftBlocks({ elapsed, from = 0 }: { elapsed: number; from?: number }) {
  return bodyDraftTimed.blocks.slice(from).map(({ block, segments }, index) => {
    const visible = segments.map((group) => group.filter((word) => word.delay <= elapsed))
    if (!visible.some((group) => group.length > 0)) return null
    if (block.kind === 'h2')
      return (
        <h2 key={index} className="pt-1 text-lg">
          <DraftWords segments={visible[0] ?? []} />
        </h2>
      )
    if (block.kind === 'ul')
      return (
        <ul key={index} className="flex list-disc flex-col gap-1 pl-5">
          {visible
            .filter((item) => item.length > 0)
            .map((item, itemIndex) => (
              <li key={itemIndex}>
                <DraftWords segments={item} />
              </li>
            ))}
        </ul>
      )
    if (block.kind === 'code')
      return (
        <pre
          key={index}
          className="overflow-hidden rounded-md bg-muted px-3 py-2 font-mono text-xs leading-5 whitespace-pre"
        >
          {visible
            .filter((line) => line.length > 0)
            .map((line, lineIndex) => (
              <div key={lineIndex}>
                <DraftWords segments={line} />
              </div>
            ))}
        </pre>
      )
    return (
      <p key={index}>
        <DraftWords segments={visible[0] ?? []} />
      </p>
    )
  })
}

function BodyField({ writing, elapsed }: { writing: boolean; elapsed: number | null }) {
  const drafting = elapsed !== null
  return (
    <Field name="body" label="Body" empty={!drafting}>
      <div
        className={cn(
          'relative rounded-md border bg-background transition-[border-color] duration-500 dark:bg-input/30',
          writing && 'border-transparent',
        )}
      >
        <AgentPresence
          agent={writerAgent}
          active={writing}
          status={drafting ? 'Writing…' : 'Waiting on Canute…'}
        />
        <div className="flex h-10 items-center gap-1 border-b px-2 text-muted-foreground">
          {toolbar.map((group, index) => (
            <span key={group[0]?.name} className="flex items-center gap-1">
              {index > 0 && <span className="mx-1 h-4 w-px bg-border" />}
              {group.map(({ name, icon: Icon }) => (
                <span
                  key={name}
                  className="inline-flex size-7 items-center justify-center rounded-sm"
                >
                  <Icon className="size-4" />
                </span>
              ))}
            </span>
          ))}
        </div>
        {drafting ? (
          <BodyDraft elapsed={elapsed} />
        ) : (
          <div className={cn('h-72 px-4 py-4 leading-6', placeholder)}>
            Start writing, or ask agents to draft it…
          </div>
        )}
      </div>
    </Field>
  )
}

const seoFields = [
  {
    name: 'meta-title',
    label: 'Meta title',
    value: 'Introducing Acme MCP: connect Acme to your AI tools',
    placeholder: 'Defaults to the post title',
    limit: 60,
    start: 0,
    duration: seoTiming.metaTitleTyped,
    leave: 1100,
  },
  {
    name: 'meta-description',
    label: 'Meta description',
    value:
      'Acme MCP lets Claude, Cursor and other AI tools read and update your Acme workspace. Set it up in a few minutes.',
    placeholder: 'Defaults to the summary',
    limit: 160,
    start: 1100,
    duration: 1500,
    leave: 3000,
  },
  {
    name: 'focus-keyword',
    label: 'Focus keyword',
    value: 'Acme MCP',
    placeholder: 'Add a keyword',
    start: 3000,
    duration: 350,
    leave: seoTiming.done,
  },
] as const

function SeoField({
  field,
  elapsed,
}: {
  field: (typeof seoFields)[number]
  elapsed: number | null
}) {
  const count =
    elapsed === null
      ? 0
      : Math.max(
          0,
          Math.min(
            field.value.length,
            Math.floor(((elapsed - field.start) / field.duration) * field.value.length),
          ),
        )
  const active =
    elapsed !== null && (field.start === 0 || elapsed >= field.start) && elapsed < field.leave
  return (
    <Field
      name={field.name}
      label={field.label}
      empty={count === 0}
      {...('limit' in field ? { aside: `${count} / ${field.limit}` } : {})}
    >
      <div
        className={cn(
          'relative transition-[border-color] duration-500',
          field.name === 'meta-description'
            ? 'min-h-16 rounded-md border bg-background px-3 py-2 leading-6 dark:bg-input/30'
            : control,
          count === 0 && placeholder,
          active && 'border-transparent',
        )}
      >
        <AgentPresence agent={askeladd} active={active} />
        <span data-demo-seo-value>{count > 0 ? field.value.slice(0, count) : ''}</span>
        {count === 0 && field.placeholder}
      </div>
    </Field>
  )
}

function SeoGroup({ elapsed, socialImage }: { elapsed: number | null; socialImage: CoverState }) {
  const imageWorking = socialImage === 'starting' || socialImage === 'generating'
  return (
    <div data-demo-field="seo" className="relative flex flex-col gap-5 rounded-lg border p-5">
      <div className="flex flex-col gap-1">
        <h4 className="font-medium">Search engine optimization</h4>
        <p className="text-xs text-muted-foreground">
          Control how this post appears in search results and link previews.
        </p>
      </div>
      <SeoField field={seoFields[0]} elapsed={elapsed} />
      <SeoField field={seoFields[1]} elapsed={elapsed} />
      <div className="grid grid-cols-2 gap-4">
        <SeoField field={seoFields[2]} elapsed={elapsed} />
        <Field name="canonical-url" label="Canonical URL" empty>
          <div className={cn(control, 'truncate', placeholder)}>Defaults to the post URL</div>
        </Field>
      </div>
      <Field name="social-image" label="Social image" empty={socialImage !== 'done'}>
        <div className="relative w-full max-w-[240px] rounded-md">
          {socialImage === 'starting' || socialImage === 'idle' ? (
            <MediaPlaceholder hint="1200 × 630" className="aspect-[1200/630]" />
          ) : (
            <div
              data-demo-social-cover
              className="relative aspect-[1200/630] overflow-hidden rounded-md bg-muted"
            >
              {socialImage === 'generating' ? (
                <div className={cn('absolute inset-0', styles.coverSheen)} />
              ) : (
                <CoverArt />
              )}
            </div>
          )}
          <AgentPresence agent={einar} active={imageWorking} />
        </div>
      </Field>
      <div data-demo-field="indexing" className="flex items-center justify-between gap-4">
        <span>Allow search engines to index this page</span>
        <span className="flex h-5 w-9 shrink-0 items-center justify-end rounded-full bg-primary p-0.5">
          <span className="size-4 rounded-full bg-primary-foreground shadow-sm" />
        </span>
      </div>
    </div>
  )
}

/** The editor's main fields: title, slug, summary, body and SEO. */
export function MainColumn({
  writerOnBody,
  bodyElapsed,
  seoElapsed,
  socialImage,
}: {
  writerOnBody: boolean
  bodyElapsed: number | null
  seoElapsed: number | null
  socialImage: CoverState
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6">
      <Field name="title" label="Title" empty={false}>
        <div className={control}>Introducing Acme MCP</div>
      </Field>
      <Field name="slug" label="Slug" hint="Generated from title" empty={false}>
        <div className={cn(control, 'gap-0.5')}>
          <span className="text-muted-foreground">/blog/</span>
          introducing-acme-mcp
        </div>
      </Field>
      <Field name="summary" label="Summary" aside="0 / 160" empty>
        <div
          className={cn(
            'min-h-20 rounded-md border bg-background px-3 py-2 leading-6 dark:bg-input/30',
            placeholder,
          )}
        >
          A short description shown in listings
        </div>
      </Field>
      <BodyField writing={writerOnBody} elapsed={bodyElapsed} />
      <SeoGroup elapsed={seoElapsed} socialImage={socialImage} />
    </div>
  )
}

function CoverArt() {
  return (
    <div className={cn('@container absolute inset-0 bg-[#141416]', styles.coverReveal)}>
      <div className={cn('absolute inset-0', styles.coverBloom)} />
      <div className={cn('absolute inset-0', styles.coverGrain)} />
      <div className="relative flex h-full flex-col items-center justify-center gap-[3.7cqw]">
        <div className="flex items-center gap-[3cqw] text-white">
          <span data-demo-cover-acme className="flex size-[7.5cqw] [&>svg]:size-full!">
            <GeneratedAvatar name="Acme Inc" size={20} />
          </span>
          <span
            data-demo-cover-slash
            className="text-[6.7cqw] leading-none font-light text-white/60"
          >
            /
          </span>
          <SiModelcontextprotocol data-demo-cover-mcp className="size-[7.5cqw]" />
        </div>
        <div className="flex flex-col items-center gap-[0.75cqw]">
          <span
            data-demo-cover-title
            className="text-[5.2cqw] leading-tight font-normal tracking-tight text-white"
          >
            Introducing Acme MCP
          </span>
          <span data-demo-cover-date className="text-[3.4cqw] leading-tight text-white/65">
            Nov 5, 2026
          </span>
        </div>
      </div>
    </div>
  )
}

function GeneratedCover({ developing }: { developing: boolean }) {
  return (
    <div
      data-demo-cover
      data-state={developing ? 'generating' : 'done'}
      className="relative aspect-video overflow-hidden rounded-md bg-muted"
    >
      {developing ? <div className={cn('absolute inset-0', styles.coverSheen)} /> : <CoverArt />}
    </div>
  )
}

function CoverField({ state }: { state: CoverState }) {
  const working = state === 'starting' || state === 'generating'
  return (
    <Field name="cover-image" label="Cover image" empty={state !== 'done'}>
      <div className="relative rounded-md">
        {state === 'generating' || state === 'done' ? (
          <GeneratedCover developing={state === 'generating'} />
        ) : (
          <MediaPlaceholder hint="Drop an image" className="aspect-video" />
        )}
        <span
          data-demo-cover-status
          data-active={working}
          style={agentHue(einar)}
          className={cn(
            'absolute bottom-2 left-2 z-10 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] whitespace-nowrap text-white transition-[opacity,translate] duration-500',
            styles.agentTab,
            working ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0',
          )}
        >
          Using
          <code className="rounded-sm bg-white/15 px-1 font-mono text-[10px]">
            /create-default-product-cover
          </code>
        </span>
        <AgentPresence agent={einar} active={working} />
      </div>
    </Field>
  )
}

/** The editor's side fields: authors, categories, tags, cover, date and reading time. */
export function SideColumn({
  writerOnCategories,
  writerOnTags,
  categoriesShown,
  tagsShown,
  cover,
  bodyDone,
  className,
}: {
  className?: string
  writerOnCategories: boolean
  writerOnTags: boolean
  categoriesShown: number
  tagsShown: number
  cover: CoverState
  bodyDone: boolean
}) {
  return (
    <div className={cn('flex w-[300px] shrink-0 flex-col gap-6 rounded-lg border p-4', className)}>
      <Field name="authors" label="Authors" empty={false}>
        <Multiselect empty={false} placeholderText="Add authors">
          <Chip>
            <PersonAvatar name="Abyan" className="size-5 text-[10px]" />
            Abyan
          </Chip>
        </Multiselect>
      </Field>
      <Field name="categories" label="Categories" empty={categoriesShown === 0}>
        <Multiselect
          agent={writerAgent}
          agentActive={writerOnCategories}
          empty={categoriesShown === 0}
          placeholderText="Add categories"
        >
          {categories.slice(0, categoriesShown).map((category) => (
            <Chip key={category} arrived>
              <Link2Icon className="opacity-60" />
              {category}
            </Chip>
          ))}
        </Multiselect>
      </Field>
      <Field name="tags" label="Tags" empty={tagsShown === 0}>
        <Multiselect
          agent={writerAgent}
          agentActive={writerOnTags}
          empty={tagsShown === 0}
          placeholderText="Add tags"
        >
          {tags.slice(0, tagsShown).map((tag) => (
            <Chip key={tag} arrived>
              {tag}
            </Chip>
          ))}
        </Multiselect>
      </Field>
      <CoverField state={cover} />
      <Field name="publish-date" label="Publish date" empty>
        <div className={cn(control, 'justify-between text-muted-foreground')}>
          Not scheduled
          <CalendarIcon className="size-4" />
        </div>
      </Field>
      <Field name="reading-time" label="Reading time" hint="Calculated from body" empty={!bodyDone}>
        {bodyDone ? (
          <span className={styles.streamCard}>{bodyReadingTime}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </Field>
    </div>
  )
}

const siteLoadingDuration = 600
export const siteUrl = 'acme.com/blog/introducing-acme-mcp'

/** A browser window for the live site preview, with its address bar and a loading bar. */
export function SitePreview({
  url,
  elapsed,
  children,
}: {
  url: string
  elapsed: number
  children: ReactNode
}) {
  const loaded = elapsed >= siteLoadingDuration
  return (
    <div
      data-demo-site-preview
      className="absolute inset-0 flex flex-col transition-opacity duration-300 starting:opacity-0"
    >
      <div data-demo-site-window className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          data-demo-site-chrome
          className="relative flex h-11 shrink-0 items-center gap-2.5 border-b bg-background px-3"
        >
          <span
            data-demo-site-field
            className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md bg-muted/60 px-2.5 text-xs text-muted-foreground"
          >
            <GlobeLockIcon className="size-3.5 shrink-0" />
            <span data-demo-site-address className="truncate">
              {url}
            </span>
          </span>
          <RotateCwIcon className="size-3.5 text-muted-foreground" />
          <span data-demo-site-close className="flex text-muted-foreground">
            <XIcon className="size-4" />
          </span>
          {!loaded && (
            <span
              className={cn(
                'absolute -bottom-px left-0 h-0.5 bg-foreground/70',
                styles.siteProgress,
              )}
            />
          )}
        </div>
        <div
          data-demo-site-page
          data-state={loaded ? 'loaded' : 'loading'}
          className="min-h-0 flex-1 overflow-hidden bg-[#f7f7f5] dark:bg-[#0f0f11] text-neutral-900 dark:text-neutral-100"
        >
          {loaded && children}
        </div>
      </div>
    </div>
  )
}

const siteNav = ['Product', 'Customers', 'Changelog', 'Pricing', 'Blog'] as const

function SiteNav() {
  return (
    <div className="flex h-16 shrink-0 items-center justify-between px-8 @max-[560px]:h-14 @max-[560px]:px-5">
      <span className="flex items-center gap-2 text-[15px] font-medium tracking-tight text-neutral-950 dark:text-white">
        <GeneratedAvatar name="Acme Inc" size={20} />
        Acme
      </span>
      <span className="flex items-center gap-0.5 rounded-full border border-black/[0.06] dark:border-white/[0.08] bg-white/70 @max-[560px]:hidden dark:bg-white/[0.04] p-1 text-[13px] text-neutral-500 dark:text-neutral-400 shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
        {siteNav.map((item) => (
          <span
            key={item}
            className={cn(
              'rounded-full px-3 py-1',
              item === 'Blog' &&
                'bg-black/[0.05] dark:bg-white/[0.08] text-neutral-950 dark:text-white',
            )}
          >
            {item}
          </span>
        ))}
      </span>
      <span className="flex items-center gap-4 text-[13px]">
        <span className="text-neutral-500 @max-[560px]:hidden dark:text-neutral-400">Sign in</span>
        <span className="flex h-8 items-center gap-1 rounded-full bg-neutral-950 pr-2.5 pl-3.5 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.15)] dark:bg-white dark:text-neutral-950">
          Get started
          <ArrowRightIcon className="size-3.5" />
        </span>
      </span>
    </div>
  )
}

const openingAt = { wide: 110, narrow: 28 } as const
const narrowSite = 560

function useSiteScroll({ opening, end }: { opening: number; end: number }) {
  const page = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = page.current
    const lead = element?.querySelector<HTMLElement>('[data-demo-site-lead]')
    const viewport = element?.parentElement
    if (!element || !lead || !viewport) return
    const offset = viewport.clientWidth < narrowSite ? openingAt.narrow : openingAt.wide
    const toOpening = Math.max(0, lead.offsetTop - offset)
    const toEnd = Math.max(toOpening, element.offsetHeight - viewport.clientHeight)
    element.style.translate = `0 -${toOpening * opening + (toEnd - toOpening) * end}px`
  }, [page, opening, end])
  return page
}

const rewrittenWords = rewrittenLine.split(' ')

function OpeningLine({ elapsed }: { elapsed: number }) {
  const rewritten = rewrittenWordsAt(elapsed)
  const selected = selectedCharsAt(elapsed)
  return (
    <span
      data-demo-site-opening
      className="rounded-sm"
      style={{ backgroundColor: `rgb(56 189 248 / ${0.28 * revisedFlashAt(elapsed)})` }}
    >
      {rewritten
        ? rewrittenWords.map((word, index) => {
            const text = index < rewrittenWords.length - 1 ? `${word} ` : word
            const ink = rewritten[index]?.ink
            return ink === undefined ? (
              <span key={index} data-demo-rewrite-pending className="invisible">
                {text}
              </span>
            ) : (
              <span key={index} data-demo-rewrite-word style={{ opacity: 0.25 + 0.75 * ink }}>
                {text}
              </span>
            )
          })
        : selected > 0 && (
            <span
              data-demo-site-selection
              className="bg-sky-500/25 text-neutral-900 dark:bg-sky-400/30 dark:text-white"
            >
              {openingLine.slice(0, selected)}
            </span>
          )}
      {!rewritten && openingLine.slice(selected)}
    </span>
  )
}

function AskAir({ elapsed }: { elapsed: number }) {
  const typed = askInstruction.slice(0, askTypedAt(elapsed))
  return (
    <div
      data-demo-ask-air
      className="absolute top-full left-0 z-10 mt-2 flex w-[400px] max-w-full flex-col rounded-xl border bg-popover p-3 text-[15px] leading-6 text-popover-foreground shadow-lg transition-[opacity,translate] duration-200 starting:translate-y-1 starting:opacity-0"
    >
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="air-mascot block size-4 shrink-0" />
        <span data-demo-ask-label>Ask {orchestrator.name}</span>
        <span
          data-demo-role-label
          className="rounded-sm bg-muted px-1 py-px text-[10px] leading-none text-muted-foreground"
        >
          {orchestrator.role}
        </span>
      </span>
      <span className="relative mt-2 block">
        <span data-demo-ask-input className="block min-h-12">
          {typed}
          <span
            data-demo-ask-caret
            className="ml-px inline-block h-[1.1em] w-px translate-y-[3px] animate-pulse bg-foreground"
          />
        </span>
        {typed.length === 0 && (
          <span className="pointer-events-none absolute inset-0 pl-1.5 text-muted-foreground/70">
            Ask for a change to this line…
          </span>
        )}
      </span>
      <span className="flex justify-end">
        <span
          data-demo-ask-send
          data-pressed={askEnterPressedAt(elapsed)}
          className={cn(
            'flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground',
            askEnterPressedAt(elapsed) && styles.sendPress,
          )}
        >
          <ArrowUpIcon className="size-4" />
        </span>
      </span>
    </div>
  )
}

/** The Acme blog post as the live site renders it, scrolled by the story or by `scroll` when given. */
export function SitePage({
  elapsed,
  bodyElapsed,
  scroll,
}: {
  elapsed: number
  bodyElapsed: number | null
  scroll?: { opening: number; end: number }
}) {
  const page = useSiteScroll(scroll ?? siteScrollAt(elapsed))
  return (
    <div ref={page} className={cn('@container relative flex flex-col', styles.streamCard)}>
      <SiteNav />
      <article className="mx-auto flex w-full max-w-[600px] flex-col px-6 pt-9 @max-[560px]:px-5 @max-[560px]:pt-5">
        <span className="flex items-center gap-1 text-[13px] text-neutral-500 dark:text-neutral-400">
          <ArrowLeftIcon className="size-3.5" />
          All posts
        </span>
        <div className="mt-6 flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
          <span className="rounded-full bg-black/[0.04] dark:bg-white/[0.06] px-2 py-0.5 text-neutral-700 dark:text-neutral-300">
            Product
          </span>
          <span>Nov 5, 2026</span>
          <span className="text-neutral-300 dark:text-neutral-600">·</span>
          <span>{bodyReadingTime}</span>
        </div>
        <h1 className="mt-4 text-[38px] @max-[560px]:text-[30px] leading-[1.08] font-medium tracking-[-0.03em] text-neutral-950 dark:text-white">
          Introducing Acme MCP
        </h1>
        <p className="mt-4 text-base leading-7 text-neutral-500 dark:text-neutral-400">
          Connect Claude, Cursor and any MCP client to your Acme workspace, and work with your
          content from the chat.
        </p>
        <div className="mt-6 flex items-center justify-between border-y border-black/[0.06] dark:border-white/[0.08] py-4 text-[13px]">
          <span className="flex items-center gap-2.5">
            <PersonAvatar name="Abyan" className="size-8" />
            <span className="flex flex-col leading-tight">
              <span className="font-medium text-neutral-950 dark:text-white">Abyan</span>
              <span className="text-neutral-500 dark:text-neutral-400">Engineering</span>
            </span>
          </span>
          <span className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
            <span className="flex size-8 items-center justify-center rounded-full border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-white/[0.04]">
              <LinkIcon className="size-3.5" />
            </span>
            <span className="flex size-8 items-center justify-center rounded-full border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-white/[0.04]">
              <ShareIcon className="size-3.5" />
            </span>
          </span>
        </div>
        <div
          data-demo-site-cover
          className="relative mt-8 aspect-[1200/630] overflow-hidden rounded-2xl shadow-[0_1px_2px_rgb(0_0_0/0.06),0_8px_24px_-8px_rgb(0_0_0/0.12)]"
        >
          <CoverArt />
        </div>
        <div className="mt-9 flex flex-col gap-3.5 text-[15px] leading-7 text-neutral-600 dark:text-neutral-400 [&_code]:bg-black/[0.05] dark:[&_code]:bg-white/[0.08] [&_h2]:pt-4 [&_h2]:text-[21px] [&_h2]:font-semibold [&_h2]:tracking-[-0.015em] [&_h2]:text-neutral-950 dark:[&_h2]:text-white [&_pre]:border [&_pre]:border-black/[0.06] dark:[&_pre]:border-white/[0.08] [&_pre]:bg-white dark:[&_pre]:bg-white/[0.04] [&_pre]:text-neutral-800 dark:[&_pre]:text-neutral-200">
          {bodyElapsed !== null && (
            <>
              <div data-demo-site-lead className="relative">
                <OpeningLine elapsed={elapsed} /> {openingRest}
                {askOpenAt(elapsed) && <AskAir elapsed={elapsed} />}
              </div>
              <DraftBlocks elapsed={bodyElapsed} from={1} />
            </>
          )}
        </div>
      </article>
    </div>
  )
}

const roomForAgentTab = 40

function useScrollToSeo(progress: number) {
  const content = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = content.current
    const seo = element?.querySelector<HTMLElement>('[data-demo-field="seo"]')
    if (!element || !seo) return
    const distance = Math.max(0, seo.offsetTop - roomForAgentTab)
    element.style.translate = `0 -${distance * progress}px`
  }, [content, progress])
  return content
}

/** A post editor for the product preview, opened on "Introducing Acme MCP" while agents fill it in. */
export function EditorView({
  shown,
  categories,
  tags,
  writerOnCategories,
  writerOnTags,
  writerOnBody,
  researchSteps,
  researchHovered,
  researchPanelOpen,
  cover,
  scrollProgress,
  bodyElapsed,
  seoElapsed,
  socialImage,
  previewElapsed,
}: {
  shown: boolean
  categories: number
  tags: number
  writerOnCategories: boolean
  writerOnTags: boolean
  writerOnBody: boolean
  researchSteps: number
  researchHovered: boolean
  researchPanelOpen: boolean
  cover: CoverState
  scrollProgress: number
  bodyElapsed: number | null
  seoElapsed: number | null
  socialImage: CoverState
  previewElapsed: number | null
}) {
  const content = useScrollToSeo(scrollProgress)
  const previewing = previewElapsed !== null
  const docsElapsed = previewElapsed === null ? null : docsPreviewAt(previewElapsed)
  const docsScroll = previewElapsed === null ? 0 : docsScrollAt(previewElapsed)
  const panelOpen = researchPanelOpen && docsElapsed === null
  return (
    <div
      data-demo-editor
      data-state={shown ? 'shown' : 'hidden'}
      data-scrolled={scrollProgress > 0}
      className={cn(
        'absolute inset-0 flex min-w-0 flex-col overflow-hidden bg-card transition-[opacity,translate] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
        shown ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0',
      )}
    >
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col transition-[padding] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
          panelOpen && 'pr-[340px]',
        )}
      >
        <TopBar
          steps={researchSteps}
          researchHovered={researchHovered}
          researchDocked={panelOpen}
          previewing={previewing}
          published={
            previewElapsed !== null &&
            (docsElapsed === null ? publishedAt(previewElapsed) : docsPublishedAt(previewElapsed))
          }
          collection={docsElapsed === null ? 'Blog posts' : 'Docs'}
          title={docsElapsed === null ? 'Introducing Acme MCP' : docsTitle}
        />
        <div className="relative min-h-0 flex-1">
          <div
            data-demo-editor-scroll
            data-hidden={previewing}
            ref={content}
            className={cn(
              'relative flex items-start gap-6 p-6 transition-opacity duration-300',
              previewing && 'opacity-0',
            )}
          >
            <MainColumn
              writerOnBody={writerOnBody}
              bodyElapsed={bodyElapsed}
              seoElapsed={seoElapsed}
              socialImage={socialImage}
            />
            <SideColumn
              writerOnCategories={writerOnCategories}
              writerOnTags={writerOnTags}
              categoriesShown={categories}
              tagsShown={tags}
              cover={cover}
              bodyDone={bodyElapsed !== null && bodyElapsed >= bodyDraftDuration}
            />
          </div>
          {docsElapsed !== null ? (
            <SitePreview key="docs" url={docsUrl} elapsed={docsElapsed}>
              <DocsPage scroll={docsScroll} />
            </SitePreview>
          ) : (
            previewing && (
              <SitePreview key="blog" url={siteUrl} elapsed={previewElapsed}>
                <SitePage elapsed={previewElapsed} bodyElapsed={bodyElapsed} />
              </SitePreview>
            )
          )}
        </div>
      </div>
      <ResearchPanel open={panelOpen} steps={researchSteps} askElapsed={previewElapsed} />
    </div>
  )
}
