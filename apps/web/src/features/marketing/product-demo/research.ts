import { BookOpenIcon, ScrollTextIcon } from 'lucide-react'
import { MarkGithubIcon } from '@primer/octicons-react'
import {
  SiAnthropic,
  SiLinear,
  SiModelcontextprotocol,
  SiNotion,
} from '@icons-pack/react-simple-icons'

/** A page or search Canute reads, with the logo shown beside it. */
export type Source = {
  url: string
  logo: React.ComponentType<{ className?: string }>
  action: 'Read' | 'Searched'
  finding: string
  gap?: boolean
}

/** A Markdown document Canute writes up from his research. */
export type Artifact = { name: string; summary: string }

/** One step in Canute's research log, timed from when the editor opens. */
export type ResearchEntry = { at: number } & (
  | { kind: 'thought'; text: string }
  | { kind: 'source'; source: Source }
  | { kind: 'decision'; question: string }
  | { kind: 'handoff'; to: string; task: string }
  | { kind: 'synthesis'; artifacts: readonly Artifact[] }
)

/** Canute's research for "Introducing Acme MCP", in the order it happens. */
export const researchLog: readonly ResearchEntry[] = [
  {
    at: 250,
    kind: 'thought',
    text: 'Starting with the spec so the post explains MCP accurately before anything Acme-specific.',
  },
  {
    at: 800,
    kind: 'source',
    source: {
      url: 'modelcontextprotocol.io/specification',
      logo: SiModelcontextprotocol,
      action: 'Read',
      finding:
        'MCP lets assistants reach tools and data through servers that expose resources, tools and prompts.',
    },
  },
  {
    at: 1100,
    kind: 'thought',
    text: 'The spec covers resources, tools and prompts. Next, the change that actually shipped MCP in Acme’s app.',
  },
  {
    at: 1500,
    kind: 'source',
    source: {
      url: 'github.com/acme/app/pulls?q=mcp+is:merged',
      logo: MarkGithubIcon,
      action: 'Searched',
      finding: 'PR #482, “Remote MCP server”, merged two days ago, looks like the launch.',
    },
  },
  {
    at: 1800,
    kind: 'thought',
    text: 'PR #482 is the launch. Reading it for scope and auth.',
  },
  {
    at: 2200,
    kind: 'source',
    source: {
      url: 'github.com/acme/app/pull/482',
      logo: MarkGithubIcon,
      action: 'Read',
      finding: 'Adds a remote MCP server at mcp.acme.com with token-scoped access to collections.',
    },
  },
  {
    at: 2500,
    kind: 'thought',
    text: 'A remote server with token scopes. The Linear issue may list the launch goals and who the post is for.',
  },
  {
    at: 2900,
    kind: 'source',
    source: {
      url: 'linear.app/acme/issue/ACM-1290',
      logo: SiLinear,
      action: 'Read',
      finding: 'Launch is planned for this week, with a blog post and docs listed as follow-ups.',
    },
  },
  {
    at: 3200,
    kind: 'thought',
    text: 'The blog post and docs are both follow-ups. If the docs already cover MCP, the post should link there.',
  },
  {
    at: 3700,
    kind: 'source',
    source: {
      url: 'docs.acme.com/search?q=mcp',
      logo: BookOpenIcon,
      action: 'Searched',
      finding: 'No MCP page in Acme’s docs yet.',
      gap: true,
    },
  },
  {
    at: 3950,
    kind: 'decision',
    question: 'Draft a docs page for MCP?',
  },
  {
    at: 4100,
    kind: 'thought',
    text: 'Nothing in the docs. Worth flagging, since readers will need a setup guide to follow from the post.',
  },
  {
    at: 4600,
    kind: 'source',
    source: {
      url: 'acme.com/changelog',
      logo: ScrollTextIcon,
      action: 'Read',
      finding: 'Recent release notes mention MCP in beta, but not the remote server.',
    },
  },
  {
    at: 5200,
    kind: 'thought',
    text: 'The changelog still says beta while the PR ships the remote server. Checking the reference servers to describe the transport correctly.',
  },
  {
    at: 5900,
    kind: 'source',
    source: {
      url: 'github.com/modelcontextprotocol/servers',
      logo: MarkGithubIcon,
      action: 'Read',
      finding: 'Reference servers run remotely over HTTP and authenticate each request.',
    },
  },
  {
    at: 6200,
    kind: 'thought',
    text: 'Remote servers use HTTP. The transports page should say which one to recommend.',
  },
  {
    at: 6450,
    kind: 'handoff',
    to: 'Air',
    task: 'draft “Connect to Acme MCP” in Docs',
  },
  {
    at: 6600,
    kind: 'source',
    source: {
      url: 'modelcontextprotocol.io/docs/concepts/transports',
      logo: SiModelcontextprotocol,
      action: 'Read',
      finding: 'Streamable HTTP is the recommended transport for remote servers.',
    },
  },
  {
    at: 7300,
    kind: 'thought',
    text: 'Streamable HTTP it is. Acme’s README should have the exact setup steps for the post.',
  },
  {
    at: 7900,
    kind: 'source',
    source: {
      url: 'github.com/acme/app/blob/main/mcp/README.md',
      logo: MarkGithubIcon,
      action: 'Read',
      finding: 'Setup adds the server URL and a scoped access token to the assistant’s config.',
    },
  },
  {
    at: 8200,
    kind: 'thought',
    text: 'Setup needs a scoped token. Checking the launch plan for tone and audience.',
  },
  {
    at: 8500,
    kind: 'source',
    source: {
      url: 'notion.so/acme/mcp-launch-plan',
      logo: SiNotion,
      action: 'Read',
      finding: 'The team wants the post to lead with what users can do, not with the protocol.',
    },
  },
  {
    at: 9100,
    kind: 'thought',
    text: 'Lead with outcomes, not protocol. One open question from the plan is rate limits.',
  },
  {
    at: 9600,
    kind: 'source',
    source: {
      url: 'linear.app/acme/issue/ACM-1302',
      logo: SiLinear,
      action: 'Read',
      finding: 'Rate limits for MCP requests ship in a later release.',
    },
  },
  {
    at: 10000,
    kind: 'thought',
    text: 'Rate limits ship later, so the post shouldn’t promise them. One last check on where MCP came from for the intro.',
  },
  {
    at: 10500,
    kind: 'source',
    source: {
      url: 'anthropic.com/news/model-context-protocol',
      logo: SiAnthropic,
      action: 'Read',
      finding: 'Anthropic introduced MCP as an open standard in November 2024.',
    },
  },
  {
    at: 11300,
    kind: 'synthesis',
    artifacts: [
      { name: 'Research brief.md', summary: 'Key facts, setup steps and sources for the post' },
    ],
  },
]

/** The brief Air hands Canute, built from the request it was given. */
export const researchBrief = {
  goal: 'Research the MCP launch so Thorfinn can write the announcement post.',
  covers: [
    'What shipped, and who it’s for',
    'How to set it up',
    'What’s still in beta or coming later',
  ],
  scope:
    'Dig wherever you need across GitHub, Linear, Notion and the docs. Return a brief with sources, and mark anything you couldn’t confirm.',
} as const

/** The decision Canute raises when he finds the docs gap, pinned until someone answers it. */
export const docsDecision = {
  question: 'Draft a docs page for MCP?',
  reason: 'Acme’s docs have no MCP page, and readers will need setup steps after the post.',
  target: { collection: 'Docs', title: 'Connect to Acme MCP' },
  replies: ['Yes, draft it', 'Not yet', 'Something else…'],
  chosen: 'Yes, draft it',
} as const

const docsDecisionIndex = researchLog.findIndex((entry) => entry.kind === 'decision')
const docsHandoffIndex = researchLog.findIndex((entry) => entry.kind === 'handoff')

/** When the docs decision is answered and handed to Air, timed from when the editor opens. */
export const docsDecisionAnsweredAt = researchLog[docsHandoffIndex]?.at ?? 0

/** Where the docs decision stands once the log has reached this many steps. */
export function docsDecisionState(steps: number): 'unasked' | 'asking' | 'sent' {
  if (steps > docsHandoffIndex) return 'sent'
  if (steps > docsDecisionIndex) return 'asking'
  return 'unasked'
}

/** The sources in the research log, in reading order. */
export const researchSources: readonly Source[] = researchLog.flatMap((entry) =>
  entry.kind === 'source' ? [entry.source] : [],
)

/** How many log entries have happened by a moment since the editor opened. */
export function researchStepsAt(sinceEditor: number) {
  return researchLog.filter((entry) => sinceEditor >= entry.at).length
}
