/** Where a post is in its workflow. */
export type Status = 'Published' | 'In review' | 'Draft'

/** The sample posts in Acme's blog collection. */
export const posts: readonly {
  title: string
  body: string
  status: Status
  authors: readonly string[]
  updated: string
}[] = [
  {
    title: 'How we cut build times by 40%',
    body: 'Our CI pipeline had grown to 18 minutes. We profiled every step, cached the slowest ones and split tests across runners. Here is what changed and what it cost us.',
    status: 'Published',
    authors: ['Maya', 'Theo'],
    updated: '2d ago',
  },
  {
    title: 'Designing for offline-first',
    body: 'Users lose signal on trains, in lifts and on flights. We rebuilt sync around a local store so edits never block on the network, and conflicts resolve without prompts.',
    status: 'In review',
    authors: ['Theo'],
    updated: '3d ago',
  },
  {
    title: 'Q3 product roundup',
    body: 'Scheduled publishing, image focal points, field-level permissions and twelve smaller fixes shipped this quarter. Here is a tour of each one with links to the docs.',
    status: 'Published',
    authors: ['Priya', 'Sam', 'Maya'],
    updated: '1w ago',
  },
  {
    title: 'A field guide to content models',
    body: 'Good content models start from how editors work, not from the database. We walk through modelling articles, authors and references for a typical publication.',
    status: 'Draft',
    authors: ['Sam'],
    updated: '1w ago',
  },
  {
    title: 'Why we moved to Postgres',
    body: 'We outgrew our document store once references and uniqueness mattered. This post covers the migration plan, the dual-write period and the queries that got faster.',
    status: 'Published',
    authors: ['Maya'],
    updated: '2w ago',
  },
  {
    title: 'Shipping localisation in a week',
    body: 'Translating fields was the easy part. Locale fallbacks, right-to-left layouts and keeping slugs stable across languages took the rest of the week.',
    status: 'Published',
    authors: ['Theo', 'Priya'],
    updated: '3w ago',
  },
]
