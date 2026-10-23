# Aircastle feature roadmap

Long-term product direction, not a list of shipped capabilities or a commitment to release dates. Scope and sequencing remain open.

Aircastle is an open-source, standalone headless CMS with code-defined collections. It will support a hosted offering and self-hosting with one CMS container and an external PostgreSQL database.

## Content assistance

- Generate, edit, rewrite, and repurpose content through Cursor-like chat on a document or selected passage.
- Follow editorial profiles that define voice, audience, terminology, and approved examples from existing content.
- Review proposed edits with an approve, reject, or edit workflow before applying them.
- Generate and edit images.
- Generate SEO metadata from the associated content.
- Search and ask questions in natural language across accessible content, with links to the entries and passages used.
- Research external sources and support fact-checking with cited evidence, conflicting findings, and unresolved questions.

## Agents and workflows

- Create reusable agents and coordinated agent teams with defined responsibilities, instructions, and tools.
- Recommend agents and workflow templates, including a Health Auditor, Research Agent, and Technical Writing Agent.
- Compose workflows that combine ordinary checks, research, AI judgments, content edits, and human review.
- Run workflows manually, on schedules, or in response to content changes and events from captured user data or connected systems.
- Use AI to create and modify agents and workflows, with their behavior available for inspection before activation.
- Return findings and proposed edits in a shared review inbox, with progress and run history.

Example: every Monday, inspect all articles for broken external links, assess readability and delivery against their editorial profiles, research flagged claims, and prepare suggested corrections for review.

## Editor signals

- Show sentence-length alerts, passive-voice estimates, heading density, paragraph length, and link and media health alongside the relevant content.
- Offer checks for tone consistency, clarity, relevance, and audience fit without treating every warning as an error.
- Use ordinary code for counts and structure, background network checks for link health, and evaluated models for judgments about meaning.
- Evaluate Jev for classification and rubric-based checks; it is a candidate, not an established dependency.

## Agent access

- Expose content operations as tools so agents can act on a user's behalf for the content tasks available in the admin.
- Connect external agents such as Claude through a permissioned interface, including MCP.
- Apply the same content validation, permissions, and review rules to admin actions, built-in agents, and external agents.

## Product priorities

- Make self-hosting simple and keep code-defined collections central to the product.
- Make agent work inspectable through specific edits, supporting evidence, and clear approval boundaries.
- Handle retries and concurrent human and agent edits without silently duplicating work or overwriting newer content.
- Treat this as a long-term roadmap rather than the scope of the first release.

A starting sequence to evaluate is content chat with reviewable edits, followed by search and editor signals, reusable agents, scheduled and event-driven workflows, and coordinated agent teams. A useful health-auditor workflow should provide an early test of whether users trust and repeatedly delegate editorial work.
