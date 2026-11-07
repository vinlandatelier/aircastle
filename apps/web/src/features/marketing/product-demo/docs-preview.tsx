import { useLayoutEffect, useRef } from 'react'
import { ArrowLeftIcon, ArrowRightIcon, InfoIcon, SearchIcon } from 'lucide-react'
import { cn } from 'cn'
import { GeneratedAvatar } from '@/components/shell'

/** Where the docs entry is published on Acme's docs site. */
export const docsUrl = 'docs.acme.com/integrations/connect-to-acme-mcp'

/** The docs entry's title, shared by the editor's breadcrumb and the page. */
export const docsTitle = 'Connect to Acme MCP'

const docsTabs = ['Guides', 'API reference', 'Changelog'] as const

const docsNav = [
  { group: 'Getting started', items: ['Introduction', 'Quickstart', 'Collections'] },
  { group: 'Integrations', items: ['Webhooks', docsTitle, 'Zapier'] },
  { group: 'Security', items: ['API tokens', 'Permissions'] },
] as const

const config = [
  '{',
  '  "mcpServers": {',
  '    "acme": {',
  '      "url": "https://mcp.acme.com",',
  '      "headers": { "Authorization": "Bearer YOUR_TOKEN" }',
  '    }',
  '  }',
  '}',
]

const steps = [
  {
    title: 'Create an API token',
    body: 'In Acme, open Settings and go to API tokens. Create a token and choose the collections it can reach.',
  },
  {
    title: 'Add the server to your client',
    body: 'Paste this into your client’s MCP config, with your token in place of YOUR_TOKEN.',
    code: config,
  },
  {
    title: 'Try it',
    body: 'Ask your assistant to list the drafts in Blog. It answers from your workspace, with your token’s permissions.',
  },
] as const

const onThisPage = ['Before you start', ...steps.map((step) => step.title), 'Permissions']

function useDocsScroll(progress: number) {
  const content = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = content.current
    const viewport = element?.parentElement
    if (!element || !viewport) return
    const distance = Math.max(0, element.offsetHeight - viewport.clientHeight)
    element.style.translate = `0 -${distance * progress}px`
  }, [content, progress])
  return content
}

/** Acme's docs site showing the "Connect to Acme MCP" guide Air's team drafted, scrolled from 0 at the top to 1 at the bottom. */
export function DocsPage({ scroll }: { scroll: number }) {
  const content = useDocsScroll(scroll)
  return (
    <div data-demo-docs-page className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-6 border-b border-black/[0.06] px-6 dark:border-white/[0.08]">
        <span className="flex items-center gap-2 text-[15px] font-medium tracking-tight text-neutral-950 dark:text-white">
          <GeneratedAvatar name="Acme Inc" size={20} />
          Acme
          <span className="text-neutral-400 dark:text-neutral-500">Docs</span>
        </span>
        <span className="flex items-center gap-1 text-[13px] text-neutral-500 dark:text-neutral-400">
          {docsTabs.map((tab) => (
            <span
              key={tab}
              className={cn(
                'rounded-md px-2.5 py-1',
                tab === 'Guides' && 'text-neutral-950 dark:text-white',
              )}
            >
              {tab}
            </span>
          ))}
        </span>
        <span className="ms-auto flex h-8 w-56 items-center gap-2 rounded-lg border border-black/[0.06] bg-white px-2.5 text-[13px] text-neutral-400 dark:border-white/[0.08] dark:bg-white/[0.04]">
          <SearchIcon className="size-3.5" />
          Search docs
          <span className="ms-auto text-[11px]">⌘K</span>
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <div ref={content} className="flex min-h-full">
          <nav
            data-demo-docs-nav
            className="flex w-56 shrink-0 flex-col gap-5 border-r border-black/[0.06] px-4 py-6 text-[13px] dark:border-white/[0.08]"
          >
            {docsNav.map(({ group, items }) => (
              <div key={group} className="flex flex-col gap-0.5">
                <span className="px-2 pb-1 text-[11px] tracking-wide text-neutral-400 uppercase dark:text-neutral-500">
                  {group}
                </span>
                {items.map((item) => (
                  <span
                    key={item}
                    aria-current={item === docsTitle ? 'page' : undefined}
                    className={cn(
                      'rounded-md px-2 py-1 text-neutral-500 dark:text-neutral-400',
                      item === docsTitle &&
                        'bg-black/[0.05] text-neutral-950 dark:bg-white/[0.08] dark:text-white',
                    )}
                  >
                    {item}
                  </span>
                ))}
              </div>
            ))}
          </nav>
          <article className="min-w-0 flex-1 px-12 pt-8">
            <div className="max-w-[580px]">
              <span className="text-[13px] text-neutral-500 dark:text-neutral-400">
                Integrations
              </span>
              <h1 className="mt-2 text-[30px] leading-tight font-medium tracking-[-0.025em] text-neutral-950 dark:text-white">
                {docsTitle}
              </h1>
              <p className="mt-3 text-[15px] leading-7 text-neutral-500 dark:text-neutral-400">
                Acme MCP lets Claude, Cursor and other MCP clients search, read and update your
                collections, with the permissions of the token you give them.
              </p>
              <div className="mt-5 flex gap-2.5 rounded-lg border border-sky-500/20 bg-sky-500/[0.06] px-3.5 py-2.5 text-[13px] leading-6 text-neutral-600 dark:text-neutral-300">
                <InfoIcon className="mt-1 size-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
                You need a client that supports remote MCP servers over Streamable HTTP.
              </div>
              <ol className="mt-7 flex flex-col gap-6">
                {steps.map((step, index) => (
                  <li key={step.title} data-demo-docs-step className="flex gap-4">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-black/[0.05] text-xs text-neutral-700 dark:bg-white/[0.08] dark:text-neutral-200">
                      {index + 1}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <h2 className="text-[16px] font-medium text-neutral-950 dark:text-white">
                        {step.title}
                      </h2>
                      <p className="text-[14px] leading-6 text-neutral-600 dark:text-neutral-400">
                        {step.body}
                      </p>
                      {'code' in step && (
                        <pre className="overflow-hidden rounded-lg border border-black/[0.06] bg-white px-4 py-3 font-mono text-[12px] leading-5 text-neutral-800 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-200">
                          {step.code.join('\n')}
                        </pre>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
              <h2 className="mt-9 text-[20px] font-medium tracking-[-0.015em] text-neutral-950 dark:text-white">
                Permissions
              </h2>
              <p className="mt-2 text-[14px] leading-6 text-neutral-600 dark:text-neutral-400">
                Your assistant can only reach the collections its token allows. A token for Blog
                can’t read or change Docs. To cut off access, revoke the token from Settings.
              </p>
              <p className="mt-3 text-[14px] leading-6 text-neutral-600 dark:text-neutral-400">
                Most clients ask you to approve each tool call. Keep approval on for{' '}
                <code className="rounded-sm bg-black/[0.05] px-1 font-mono text-[0.85em] dark:bg-white/[0.08]">
                  upsert_entry
                </code>
                , since it writes to your content.
              </p>
              <div
                data-demo-docs-end
                className="mt-10 mb-10 flex flex-col gap-6 border-t border-black/[0.06] pt-6 dark:border-white/[0.08]"
              >
                <span className="flex items-center gap-3 text-[13px] text-neutral-500 dark:text-neutral-400">
                  Was this page helpful?
                  <span className="rounded-md border border-black/[0.08] px-2.5 py-0.5 dark:border-white/[0.1]">
                    Yes
                  </span>
                  <span className="rounded-md border border-black/[0.08] px-2.5 py-0.5 dark:border-white/[0.1]">
                    No
                  </span>
                </span>
                <span className="grid grid-cols-2 gap-3 text-[13px]">
                  <span className="flex flex-col gap-0.5 rounded-lg border border-black/[0.06] px-4 py-3 dark:border-white/[0.08]">
                    <span className="flex items-center gap-1 text-neutral-500 dark:text-neutral-400">
                      <ArrowLeftIcon className="size-3" />
                      Previous
                    </span>
                    <span className="text-neutral-950 dark:text-white">Webhooks</span>
                  </span>
                  <span className="flex flex-col items-end gap-0.5 rounded-lg border border-black/[0.06] px-4 py-3 dark:border-white/[0.08]">
                    <span className="flex items-center gap-1 text-neutral-500 dark:text-neutral-400">
                      Next
                      <ArrowRightIcon className="size-3" />
                    </span>
                    <span className="text-neutral-950 dark:text-white">Zapier</span>
                  </span>
                </span>
              </div>
            </div>
          </article>
          <aside className="flex w-48 shrink-0 flex-col gap-1.5 py-8 pr-6 text-[12px] text-neutral-500 dark:text-neutral-400">
            <span className="pb-1 text-neutral-950 dark:text-white">On this page</span>
            {onThisPage.map((item, index) => (
              <span key={item} className={cn(index === 0 && 'text-neutral-950 dark:text-white')}>
                {item}
              </span>
            ))}
          </aside>
        </div>
      </div>
    </div>
  )
}
