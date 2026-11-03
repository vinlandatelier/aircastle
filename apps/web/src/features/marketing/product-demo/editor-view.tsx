import {
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

function AgentTab({ agent, role }: { agent: string; role: string }) {
  return (
    <div
      data-demo-agent-tab
      className={cn(
        'absolute right-2 bottom-[calc(100%-3px)] z-10 flex items-center gap-1.5 rounded-t-md px-1.5 pt-1 pb-[calc(0.25rem+3px)] text-xs text-white',
        styles.agentTab,
      )}
    >
      <span className={cn('rounded-full', styles.agentAvatar)}>
        <GeneratedAvatar name={agent} size={16} variant="beam" />
      </span>
      {agent}
      <span className="rounded-sm bg-white/20 px-1 py-px text-[10px] leading-none">{role}</span>
    </div>
  )
}

function Multiselect({
  agent,
  placeholderText,
  children,
}: {
  agent?: { name: string; role: string }
  placeholderText: string
  children?: React.ReactNode
}) {
  return (
    <div
      data-demo-multiselect
      data-agent={agent?.name}
      className={cn(
        'relative flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border bg-background p-1.5 dark:bg-input/30',
        agent && ['border-transparent', styles.agentField],
      )}
    >
      {children}
      <span className="inline-flex items-center gap-1 px-1 text-xs text-muted-foreground">
        <PlusIcon className="size-3" />
        {placeholderText}
      </span>
      {agent && <AgentTab agent={agent.name} role={agent.role} />}
    </div>
  )
}

const writer = { name: 'Thorfinn', role: 'Agent' } as const

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

function TopBar() {
  return (
    <div className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between border-b bg-card px-6">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Blog posts</span>
        <span className="text-muted-foreground">/</span>
        <span>Introducing Acme MCP</span>
      </div>
      <div className="flex items-center gap-2">
        <span
          data-demo-preview
          className="flex h-8 items-center gap-1.5 rounded-md pr-3 pl-2.5 text-muted-foreground"
        >
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

function BodyField() {
  return (
    <Field name="body" label="Body" empty>
      <div className="overflow-hidden rounded-md border bg-background dark:bg-input/30">
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

function MainColumn() {
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
      <BodyField />
      <SeoGroup />
    </div>
  )
}

function SideColumn({
  categoriesShown,
  tagsShown,
}: {
  categoriesShown: number
  tagsShown: number
}) {
  return (
    <div className="flex w-[300px] shrink-0 flex-col gap-6 rounded-lg border p-4">
      <Field name="authors" label="Authors" empty={false}>
        <Multiselect placeholderText="Add">
          <Chip>
            <Initial name="Abyan" />
            Abyan
          </Chip>
        </Multiselect>
      </Field>
      <Field name="categories" label="Categories" empty={categoriesShown === 0}>
        <Multiselect agent={writer} placeholderText="Add">
          {categories.slice(0, categoriesShown).map((category) => (
            <Chip key={category} arrived>
              <Link2Icon className="opacity-60" />
              {category}
            </Chip>
          ))}
        </Multiselect>
      </Field>
      <Field name="tags" label="Tags" empty={tagsShown === 0}>
        <Multiselect agent={writer} placeholderText="Add">
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
}: {
  shown: boolean
  categories: number
  tags: number
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
      <TopBar />
      <div data-demo-editor-scroll className="flex items-start gap-6 p-6">
        <MainColumn />
        <SideColumn categoriesShown={categories} tagsShown={tags} />
      </div>
    </div>
  )
}
