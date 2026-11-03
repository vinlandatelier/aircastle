import {
  ChevronRightIcon,
  FileTextIcon,
  SparklesIcon,
  ArrowUpIcon,
  BrainIcon,
  LoaderCircleIcon,
  TriangleAlertIcon,
  CircleCheckIcon,
  XIcon,
  EyeIcon,
  SaveIcon,
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
import { cn } from 'cn'
import styles from './product-demo.module.css'
import { researchLog, researchSources, type Artifact, type ResearchEntry } from './research'
import { prompt } from './timeline'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Message, MessageContent } from '@/components/ui/message'
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
import { GeneratedAvatar } from '@/components/shell/generated-avatar'

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

function Initial({ name }: { name: string }) {
  return (
    <span className="inline-flex size-5 items-center justify-center rounded-full bg-muted text-[10px] text-muted-foreground">
      {name.slice(0, 1)}
    </span>
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

function AgentPresence({
  agent,
  active,
  status,
}: {
  agent: { name: string; role: string }
  active: boolean
  status?: string
}) {
  return (
    <>
      <span
        data-demo-agent-outline
        data-active={active}
        className={cn(
          'pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-500',
          styles.agentField,
          active ? 'opacity-100' : 'opacity-0',
        )}
      />
      <AgentTab agent={agent.name} role={agent.role} active={active} status={status} />
    </>
  )
}

function AgentTab({
  agent,
  role,
  active,
  status,
}: {
  agent: string
  role: string
  active: boolean
  status: string | undefined
}) {
  return (
    <div
      data-demo-agent-tab
      data-active={active}
      className={cn(
        'absolute right-2 bottom-[calc(100%-3px)] z-10 flex items-center gap-1.5 rounded-t-md px-1.5 pt-1 pb-[calc(0.25rem+3px)] text-xs whitespace-nowrap text-white transition-[opacity,translate] duration-500',
        styles.agentTab,
        active ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0',
      )}
    >
      <span className={cn('rounded-full', styles.agentAvatar)}>
        <GeneratedAvatar name={agent} size={16} variant="beam" />
      </span>
      {agent}
      <span className="rounded-sm bg-white/20 px-1 py-px text-[10px] leading-none">{role}</span>
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
  agent?: { name: string; role: string }
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

const writerAgent = { name: 'Thorfinn', role: 'Agent' } as const
const researcher = 'Canute'

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

function sourcesReadBy(steps: number) {
  return researchLog.slice(0, steps).filter((entry) => entry.kind === 'source').length
}

function ResearchStatus({ steps, hovered }: { steps: number; hovered: boolean }) {
  const sourcesRead = sourcesReadBy(steps)
  const currentIndex = sourcesRead - 1
  const done = steps >= researchLog.length
  return (
    <span
      data-demo-research
      data-state={done ? 'done' : 'working'}
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
            'flex h-8 w-max items-center gap-2 rounded-md pr-2.5 pl-1.5 text-violet-700 transition-colors duration-200 dark:text-violet-300',
            hovered ? 'bg-violet-500/20' : 'bg-violet-500/10',
          )}
        >
          <span className={cn('rounded-full', styles.agentAvatar)}>
            <GeneratedAvatar name={researcher} size={18} variant="beam" />
          </span>
          <span>{researcher}</span>
          <span className="rounded-sm bg-violet-500/15 px-1 py-px text-[10px] leading-none">
            Agent
          </span>
          <span className="text-violet-600/70 dark:text-violet-300/70">
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

function ResearchEntryView({ entry }: { entry: ResearchEntry }) {
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
  return (
    <TraceLine className={cn('text-xs', entering)}>
      <TraceIcon>
        <SparklesIcon className="size-3.5" />
      </TraceIcon>
      <TraceTitle>Synthesised findings into {entry.artifacts.length} notes</TraceTitle>
    </TraceLine>
  )
}

function PendingStep({ entry }: { entry: ResearchEntry }) {
  const text =
    entry.kind === 'thought'
      ? 'Thinking…'
      : entry.kind === 'source'
        ? `${entry.source.action === 'Read' ? 'Reading' : 'Searching'} ${entry.source.url}`
        : 'Synthesising findings…'
  return (
    <TraceLine data-demo-research-pending status="running" className="text-xs">
      <TraceIcon>
        {entry.kind === 'thought' ? (
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
              <ResearchEntryView key={entry.at} entry={entry} />
            ))}
            {next && <PendingStep entry={next} />}
          </Trace>
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  )
}

const replyText =
  'Here’s what I found. Acme’s docs don’t cover MCP yet, so I drafted an outline for that too.'
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
            {index < replyWords.length - 1 ? `${word} ` : word}
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
          <FileTextIcon className="size-5 shrink-0 text-violet-600 dark:text-violet-400" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span>{artifact.name}</span>
            <span className="truncate text-xs text-muted-foreground">{artifact.summary}</span>
          </span>
          <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
        </span>
      ))}
    </div>
  )
}

const synthesis = researchLog.find((entry) => entry.kind === 'synthesis')

function ResearchPanel({ open, steps }: { open: boolean; steps: number }) {
  const done = steps >= researchLog.length
  return (
    <div
      data-demo-research-panel
      data-state={open ? 'open' : 'closed'}
      className={cn(
        'absolute top-14 right-0 bottom-0 z-30 flex w-[340px] flex-col border-l bg-card transition-[translate,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
        open ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-full opacity-0',
      )}
    >
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={cn('rounded-full', styles.agentAvatar)}>
            <GeneratedAvatar name={researcher} size={22} variant="beam" />
          </span>
          <span>{researcher}</span>
          <span
            data-demo-agent-label
            className="rounded-sm bg-muted px-1 py-px text-[10px] leading-none text-muted-foreground"
          >
            Agent
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">
            {done ? 'Research complete' : 'Researching'}
          </span>
        </div>
        <XIcon className="size-4 text-muted-foreground" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-end gap-4 overflow-hidden p-4">
        <Message align="end" className="shrink-0">
          <MessageContent>
            <Bubble align="end" variant="muted" data-demo-research-request>
              <BubbleContent>{prompt}</BubbleContent>
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
      </div>
      <div className="p-3">
        <InputGroup data-demo-research-prompt className="dark:bg-input/30">
          <InputGroupTextarea
            readOnly
            tabIndex={-1}
            rows={1}
            placeholder="Ask Canute to dig deeper…"
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

function TopBar({ steps, researchHovered }: { steps: number; researchHovered: boolean }) {
  return (
    <div className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between border-b bg-card px-6">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Blog posts</span>
        <span className="text-muted-foreground">/</span>
        <span>Introducing Acme MCP</span>
      </div>
      <div className="flex items-center gap-2">
        <ResearchStatus steps={steps} hovered={researchHovered} />
        <span data-demo-preview className="flex h-8 items-center gap-1.5 rounded-md pr-3 pl-2.5">
          <EyeIcon className="size-4" />
          Preview
        </span>
        <span
          data-demo-save
          className="flex h-8 items-center gap-1.5 rounded-md border bg-background pr-3 pl-2.5 dark:bg-input/30"
        >
          <SaveIcon className="size-4" />
          Save
        </span>
        <span className="flex h-8 items-center rounded-md bg-primary px-3 text-primary-foreground">
          Publish
        </span>
      </div>
    </div>
  )
}

function BodyField({ writing }: { writing: boolean }) {
  return (
    <Field name="body" label="Body" empty>
      <div
        className={cn(
          'relative rounded-md border bg-background transition-[border-color] duration-500 dark:bg-input/30',
          writing && 'border-transparent',
        )}
      >
        <AgentPresence agent={writerAgent} active={writing} status="Waiting on Canute…" />
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
        <div className={cn('min-h-40 px-4 py-4 leading-6', placeholder)}>
          Start writing, or ask agents to draft it…
        </div>
      </div>
    </Field>
  )
}

function SeoGroup() {
  return (
    <div data-demo-field="seo" className="flex flex-col gap-5 rounded-lg border p-5">
      <div className="flex flex-col gap-1">
        <h4 className="font-medium">Search engine optimization</h4>
        <p className="text-xs text-muted-foreground">
          Control how this post appears in search results and link previews.
        </p>
      </div>
      <Field name="meta-title" label="Meta title" aside="0 / 60" empty>
        <div className={cn(control, placeholder)}>Defaults to the post title</div>
      </Field>
      <Field name="meta-description" label="Meta description" aside="0 / 160" empty>
        <div
          className={cn(
            'min-h-16 rounded-md border bg-background px-3 py-2 leading-6 dark:bg-input/30',
            placeholder,
          )}
        >
          Defaults to the summary
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field name="focus-keyword" label="Focus keyword" empty>
          <div className={cn(control, placeholder)}>Add a keyword</div>
        </Field>
        <Field name="canonical-url" label="Canonical URL" empty>
          <div className={cn(control, 'truncate', placeholder)}>Defaults to the post URL</div>
        </Field>
      </div>
      <Field name="social-image" label="Social image" empty>
        <MediaPlaceholder hint="1200 × 630" className="h-32" />
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

function MainColumn({ writerOnBody }: { writerOnBody: boolean }) {
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
      <BodyField writing={writerOnBody} />
      <SeoGroup />
    </div>
  )
}

function SideColumn({
  writerOnCategories,
  writerOnTags,
  categoriesShown,
  tagsShown,
}: {
  writerOnCategories: boolean
  writerOnTags: boolean
  categoriesShown: number
  tagsShown: number
}) {
  return (
    <div className="flex w-[300px] shrink-0 flex-col gap-6 rounded-lg border p-4">
      <Field name="authors" label="Authors" empty={false}>
        <Multiselect empty={false} placeholderText="Add authors">
          <Chip>
            <Initial name="Abyan" />
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
      <Field name="cover-image" label="Cover image" empty>
        <MediaPlaceholder hint="Drop an image" className="aspect-video" />
      </Field>
      <Field name="publish-date" label="Publish date" empty>
        <div className={cn(control, 'justify-between text-muted-foreground')}>
          Not scheduled
          <CalendarIcon className="size-4" />
        </div>
      </Field>
      <Field name="reading-time" label="Reading time" hint="Calculated from body" empty>
        <span className="text-muted-foreground">—</span>
      </Field>
    </div>
  )
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
}) {
  return (
    <div
      data-demo-editor
      data-state={shown ? 'shown' : 'hidden'}
      className={cn(
        'absolute inset-0 flex min-w-0 flex-col overflow-hidden bg-card transition-[opacity,translate] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
        shown ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0',
      )}
    >
      <TopBar steps={researchSteps} researchHovered={researchHovered} />
      <div
        data-demo-editor-scroll
        className={cn(
          'flex items-start gap-6 p-6 transition-[padding] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
          researchPanelOpen && 'pr-[calc(1.5rem+340px)]',
        )}
      >
        <MainColumn writerOnBody={writerOnBody} />
        <SideColumn
          writerOnCategories={writerOnCategories}
          writerOnTags={writerOnTags}
          categoriesShown={categories}
          tagsShown={tags}
        />
      </div>
      <ResearchPanel open={researchPanelOpen} steps={researchSteps} />
    </div>
  )
}
