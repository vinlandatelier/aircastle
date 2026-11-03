import {
  BoldIcon,
  CalendarIcon,
  ChevronDownIcon,
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
import { Badge } from '@/components/ui/badge'
import { GeneratedAvatar } from '@/components/shell/generated-avatar'

const agents = ['Thorfinn', 'Canute', 'Askeladd', 'Bjorn'] as const

const control = 'flex h-9 items-center rounded-md border bg-background px-3 dark:bg-input/30'

const summary =
  'Acme now ships an MCP server, so AI assistants can read and update your content through the same permissions as your team.'

const configSnippet = `{
  "mcpServers": {
    "acme": {
      "url": "https://mcp.acme.com",
      "token": "$ACME_TOKEN"
    }
  }
}`

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
  aside,
  hint,
  children,
}: {
  name: string
  label: string
  aside?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div data-demo-field={name} className="flex flex-col gap-1.5">
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

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <Badge variant="secondary" className="h-6 gap-1.5 px-2 text-xs">
      {children}
    </Badge>
  )
}

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
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex -space-x-1">
            {agents.map((agent) => (
              <span key={agent} className="rounded-full ring-2 ring-card">
                <GeneratedAvatar name={agent} size={16} variant="beam" />
              </span>
            ))}
          </span>
          Agents are drafting
        </span>
        <span className="flex h-8 items-center gap-2 rounded-md border bg-background pr-2 pl-3 dark:bg-input/30">
          Draft
          <ChevronDownIcon className="size-4 text-muted-foreground" />
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
    <Field name="body" label="Body">
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
        <div className="flex flex-col gap-3 px-4 py-4 leading-6">
          <h4 className="text-lg font-medium">What is MCP?</h4>
          <p>
            The Model Context Protocol is an open standard that lets AI assistants talk to the tools
            you already use. Instead of copying drafts between a chat window and the CMS, an
            assistant can list collections, read entries and propose edits directly.
          </p>
          <p>
            The Acme MCP server exposes your content through the same roles and field rules as the
            dashboard. An assistant can only see and change what its token allows, and every change
            lands as a draft for your team to review.
          </p>
          <h4 className="text-lg font-medium">Getting started</h4>
          <p>Create an access token in Settings, then add the server to your client:</p>
          <pre className="overflow-hidden rounded-md bg-muted px-4 py-3 font-mono text-xs leading-5">
            {configSnippet}
          </pre>
          <ul className="list-disc space-y-1 pl-5">
            <li>Works with any client that supports remote MCP servers.</li>
            <li>Tokens can be scoped to a single collection or locale.</li>
            <li>Every agent edit is recorded in the entry history.</li>
          </ul>
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
      <Field name="meta-title" label="Meta title" aside="45 / 60">
        <div className={control}>Introducing Acme MCP: AI access to your CMS</div>
      </Field>
      <Field name="meta-description" label="Meta description" aside="132 / 160">
        <div className="rounded-md border bg-background px-3 py-2 leading-6 dark:bg-input/30">
          Connect AI assistants to Acme with the new MCP server. Read and update content with the
          same permissions your team already uses.
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field name="focus-keyword" label="Focus keyword">
          <div className={control}>Acme MCP</div>
        </Field>
        <Field name="canonical-url" label="Canonical URL">
          <div className={cn(control, 'truncate')}>https://acme.com/blog/introducing-acme-mcp</div>
        </Field>
      </div>
      <Field name="social-image" label="Social image">
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
      <Field name="title" label="Title">
        <div className={control}>Introducing Acme MCP</div>
      </Field>
      <Field name="slug" label="Slug" hint="Generated from title">
        <div className={cn(control, 'gap-0.5')}>
          <span className="text-muted-foreground">/blog/</span>
          introducing-acme-mcp
        </div>
      </Field>
      <Field name="summary" label="Summary">
        <div className="flex flex-col gap-1 rounded-md border bg-background px-3 py-2 dark:bg-input/30">
          <p className="line-clamp-2 leading-6">{summary}</p>
          <span className="self-end text-xs text-muted-foreground tabular-nums">
            {summary.length} / 160
          </span>
        </div>
      </Field>
      <BodyField />
      <SeoGroup />
    </div>
  )
}

function SideColumn() {
  return (
    <div className="flex w-[300px] shrink-0 flex-col gap-5 rounded-lg border p-4">
      <Field name="authors" label="Authors">
        <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border bg-background p-1.5 dark:bg-input/30">
          {['Abyan'].map((author) => (
            <Chip key={author}>
              <Initial name={author} />
              {author}
            </Chip>
          ))}
          <span className="inline-flex items-center gap-1 px-1 text-xs text-muted-foreground">
            <PlusIcon className="size-3" />
            Add
          </span>
        </div>
      </Field>
      <Field name="categories" label="Categories">
        <div className="flex flex-wrap gap-1.5">
          {['Product', 'Announcements'].map((category) => (
            <Chip key={category}>
              <Link2Icon className="text-muted-foreground" />
              {category}
            </Chip>
          ))}
        </div>
      </Field>
      <Field name="tags" label="Tags">
        <div className="flex flex-wrap gap-1.5">
          {['MCP', 'AI', 'Integrations'].map((tag) => (
            <Chip key={tag}>{tag}</Chip>
          ))}
        </div>
      </Field>
      <Field name="cover-image" label="Cover image">
        <MediaPlaceholder hint="Drop an image" className="aspect-video" />
      </Field>
      <Field name="publish-date" label="Publish date">
        <div className={cn(control, 'justify-between text-muted-foreground')}>
          Not scheduled
          <CalendarIcon className="size-4" />
        </div>
      </Field>
      <Field name="reading-time" label="Reading time" hint="Calculated from body">
        <span>4 min read</span>
      </Field>
    </div>
  )
}

/** A static post editor for the product preview, opened on "Introducing Acme MCP". */
export function EditorView({ shown }: { shown: boolean }) {
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
        <SideColumn />
      </div>
    </div>
  )
}
