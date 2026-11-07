export type DraftBlock =
  | { kind: 'h2' | 'p'; text: string }
  | { kind: 'ul'; items: readonly string[] }
  | { kind: 'code'; lines: readonly string[] }

/** The post's first sentence, which the user asks Air to rework on the live site. */
export const openingLine =
  'Acme MCP lets any MCP client read and act on your workspace, with the same permissions as the person using it.'

/** The rest of the post's first paragraph, after the opening line. */
export const openingRest =
  'Connect Claude, Cursor or another client to mcp.acme.com, and your assistant can search, read and update your collections from the chat.'

/** Thorfinn's rewrite of the opening line, after Thorkell's review. */
export const rewrittenLine =
  'Ask Claude to find every stale draft in your workspace, and it works in Acme the way you would, with your permissions.'

const bodyDraft: readonly DraftBlock[] = [
  { kind: 'p', text: `${openingLine} ${openingRest}` },
  {
    kind: 'p',
    text: 'MCP support in Acme used to mean running a local server, and it was in beta. The remote server replaces it. There is nothing to install, and each connection reaches only the collections you allow.',
  },
  { kind: 'h2', text: 'What you can do' },
  {
    kind: 'p',
    text: 'Ask your assistant to work with your content in plain language. For example:',
  },
  {
    kind: 'ul',
    items: [
      'Find every draft that mentions pricing and list who owns it.',
      "Summarise this week's changes to the Docs collection.",
      'Turn the notes in this thread into a changelog entry.',
    ],
  },
  { kind: 'p', text: 'The server gives your assistant four tools:' },
  {
    kind: 'ul',
    items: [
      '`search_entries` finds entries by text or field value.',
      '`get_entry` reads one entry with all of its fields.',
      '`upsert_entry` creates an entry or updates an existing one.',
      '`list_collections` shows the collections your token can reach.',
    ],
  },
  { kind: 'h2', text: 'Connect your assistant' },
  {
    kind: 'p',
    text: "Create an access token in Settings under API tokens, and choose the collections it can reach. Then add the server to your client's MCP config:",
  },
  {
    kind: 'code',
    lines: [
      '{',
      '  "mcpServers": {',
      '    "acme": {',
      '      "url": "https://mcp.acme.com",',
      '      "headers": { "Authorization": "Bearer YOUR_TOKEN" }',
      '    }',
      '  }',
      '}',
    ],
  },
  {
    kind: 'p',
    text: 'The server uses the Streamable HTTP transport from the MCP specification. Any client that supports remote MCP servers over Streamable HTTP can connect.',
  },
  { kind: 'h2', text: 'Security' },
  {
    kind: 'p',
    text: "Every token has its own scope. A token for the Blog collection can't read or change Docs, and you can revoke a token from Settings at any time.",
  },
  {
    kind: 'p',
    text: 'Your assistant acts with the permissions of its token. Most MCP clients ask you to approve each tool call. Keep approval on for `upsert_entry`, since it writes to your content.',
  },
  { kind: 'h2', text: "What's next" },
  {
    kind: 'p',
    text: "Configurable rate limits for MCP requests are coming in a later release. We're also adding a Connect to Acme MCP guide to the docs.",
  },
  {
    kind: 'p',
    text: 'MCP is an open standard that Anthropic introduced in November 2024. To try it now, create a token and add mcp.acme.com to your client.',
  },
]
const draftStartsAfter = 150
const draftWordInterval = 10
const draftLineInterval = 45

export type DraftSegment = { text: string; delay: number }

function segmentWords(text: string, start: number) {
  return text.split(' ').map((word, index, all) => ({
    text: index < all.length - 1 ? `${word} ` : word,
    delay: start + index * draftWordInterval,
  }))
}

/** The launch post Thorfinn drafts, with when each word appears after he starts. */
export const bodyDraftTimed = bodyDraft.reduce<{
  at: number
  blocks: { block: DraftBlock; segments: DraftSegment[][] }[]
}>(
  (timed, block) => {
    const groups =
      block.kind === 'ul'
        ? block.items
        : block.kind === 'code'
          ? block.lines.map((line) => [line])
          : [block.text]
    let at = timed.at
    const segments = groups.map((group) => {
      if (block.kind === 'code') {
        const line = [{ text: String(group), delay: at }]
        at += draftLineInterval
        return line
      }
      const words = segmentWords(String(group), at)
      at += words.length * draftWordInterval
      return words
    })
    return { at, blocks: [...timed.blocks, { block, segments }] }
  },
  { at: draftStartsAfter, blocks: [] },
)

/** How long Thorfinn takes to draft the body, in milliseconds of the timeline. */
export const bodyDraftDuration = bodyDraftTimed.at

const wordsPerMinute = 230

/** The body's reading time once the draft is done. */
export const bodyReadingTime = `${Math.max(
  1,
  Math.ceil(
    bodyDraftTimed.blocks
      .flatMap(({ segments }) => segments.flat())
      .filter(({ text }) => !text.includes('\n')).length / wordsPerMinute,
  ),
)} min read`
