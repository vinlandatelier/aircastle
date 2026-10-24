# Architecture

This map records module ownership and the pattern for organizing features. Entries marked `planned` describe intended locations that have not been built.

## Module map

```text
apps/
├── api/                      HTTP API and Bun startup
│   └── src/
│       └── features/         HTTP interfaces by feature
│           ├── health/       Process liveness and its response schema
│           └── content/      Project schema publication and content HTTP routes
└── web/                      React admin
    ├── scripts/              Theme-aware brand icon generation
    └── src/
        ├── components/       Shared presentation modules
        │   ├── shell/        Persistent header, sidebar, page frame, and supporting controls
        │   └── ui/           Local shadcn UI components built on Base UI
        ├── features/         Product behavior by feature
        │   └── navigation/   Shared page catalog, sidebar navigation, and page search
        ├── hooks/            Browser state subscriptions
        └── lib/              Browser-safe UI utilities

packages/
├── schema/                   Collection definitions, validation, and descriptions
├── contracts/                Shared content contracts and schema compatibility
├── core/                     CMS operations, authorization, publication, and resource lifecycle
├── adapter-postgres/         Owned SQL storage, constraints, and migrations
├── client/                   Developer config and typed HTTP client
└── cli/                      Schema publication, reconciliation, and lockfiles

scripts/                      Repository checks and local development tooling
├── ai-automation/            Organization authorization, PR context, and advisory review/fix publication
└── ai-models/                Pinned model roles and bounded provider API calls

.github/                      CI workflows, shared setup, and model selections
```

The API assembles middleware, feature routes, and API documentation through `createApp({ logger, cms, maxRequestBytes })` in `apps/api/src/app.ts`. Bun startup in `src/index.ts` validates environment configuration, constructs the logger and CMS runtime, and initializes owned storage before listening. Shutdown stops accepting requests, drains CMS operations, and closes storage. `src/cli.ts` exports a quiet app from the same factory with a silent logger and no `cms`, so it serves no content routes.

The server mounts every API route under `/api`, including `/api/docs` and `/api/openapi.json`. Feature routers use paths relative to that mount and follow the feature pattern below.

Vite forwards `/api` requests unchanged during development and preview. The built API owns the same prefix without Vite. Hosted routing must forward `/api` unchanged to Bun. Production admin serving and deployment configuration are not implemented yet.

## Web app structure

Paths in this section are relative to `apps/web`.

- `src/App.tsx`, `src/main.tsx`, and `src/router.tsx` compose the app, providers, and routes. `App` provides light, dark, and system themes with `next-themes` and keeps the shell mounted as page destinations change.
- `src/components/shell/` owns the persistent header, sidebar, page frame, and private supporting controls. The sidebar collapses independently beneath the full-width header. Import the shell through its `index.tsx` entry point.
- `src/components/ui/` holds shared UI primitives built on Base UI.
- `src/features/<feature>/` owns a product feature's behavior, types, data fetching, and tests. Import features through their `index.ts` or `index.tsx` entry point; keep supporting files private.
- Keep feature-specific hooks and helpers inside their feature. Reserve `src/hooks/` and `src/lib/` for shared browser subscriptions and utilities.
- Keep public-interface behavior tests beside the module implementation. Add feature folders only when implementing their behavior.

`src/features/navigation` owns the page catalog, sidebar links, and keyboard page search. `src/router.tsx` registers destinations from that catalog and redirects the index to Collections. Destinations currently render dashboard placeholders. `components.json` configures shadcn and the Efferd registry.

Colocated component tests use Vite+ and happy-dom. `e2e/` owns Chromium journeys, extreme-input fixtures, and command/report conformance tests. `playwright.config.ts` owns browser execution settings. A verification-only Vite adapter supplies fixture data before rendering; normal production builds retain their real data and expose no fixture controls.

`scripts/verify-web.ts` owns verification commands and evidence. Browser runs build and serve isolated normal and fixture outputs on allocated ports, use fresh browser contexts, and clean up their own servers. Reports, coverage, traces, and screenshots stay in ignored per-run output directories. Coverage measures TypeScript execution, including unimported source; it does not measure CSS or establish correctness.

## Repository automation

`scripts/ai-automation/index.ts` owns review/fix authorization, output validation, and prompts. Each reviewer role has its own review lens there: one hunts for correctness failures, the other checks quality and conformance with `AGENTS.md`. `github.ts` holds the coordinator, which owns immutable source capture, authenticated claims, revision checks, and publication. The workflow uses trusted default-branch code and checks current `vinlandatelier` membership before model calls. It scans PR revisions and inline commands on a schedule; a new PR comment that mentions a bot can wake it immediately. Source and model output remain data in credential-bearing jobs. Supported fixes run selected file-level checks in a separate container and publish through a fresh trusted job as follow-up PRs. Fixes for fork PRs are published only as patches. Unsupported scopes produce explicitly unverified patch artifacts without executing repository checks.

`scripts/ai-models/index.ts` owns the four-role config parser and provider API transport. Callers supply task text and a bounded output schema. `.github/ai-models.json` pins each role's model and effort.

Privileged workflows use the `ai-automation` environment, restricted to the `main` branch. [Automation instructions](.github/AGENTS.md) record the activation requirements and trust boundaries. Live setup is distinct from offline configuration validation.

## Feature pattern

The folder names the feature. Small features such as API health keep their implementation and public-interface tests together:

```text
<feature>/
├── index.ts
└── index.test.ts
```

- `index.ts` holds the implementation and public interface. It need not be a barrel that only re-exports other files.
- Keep closely related schemas, handlers, types, and rules together when they belong to that module's responsibility.
- Extract supporting files when they have a distinct responsibility, are reused, or make the main file harder to understand. Use specific names such as `tools.ts` or `revisions.ts`.
- Keep supporting files private. Cross-module callers use the public entry point.
- Optimize how much code a reader needs to understand one change. File count alone is not the goal.

The API content feature separates HTTP mechanics behind the same public factory:

```text
content/
├── index.ts          Public factory, route descriptions, handlers, and hand-written input checks
├── request.ts        Credentials and bounded JSON body parsing
├── responses.ts      Result status mapping and sanitized error responses
└── index.test.ts     HTTP behavior through createApp
```

The content routes check their input by hand and have no request schemas yet. `apps/api/AGENTS.md` describes how API routes declare schemas and where handlers go. Test supporting files through the feature's public behavior; do not export them from the entry point solely for tests.

`tests/harness/module-boundaries.test.ts` fails when a file under `apps/api/src` reaches into another API feature's private files through a relative static import, re-export, import-type query, dynamic `import()`, `require`, or `createRequire` loader.

This is a general pattern, not a required file inventory for every module. Existing modules can adopt it when relevant work warrants a change.

## Ownership

- `apps/api` translates HTTP requests and agent tool calls into CMS operations. It owns transport schemas, logging integration, API documentation, and runtime resource assembly. Keep startup configuration outside feature handlers.
- `apps/web` owns the admin shell, local UI components, and browser state. Its module layout and entry points are described in [Web app structure](#web-app-structure).
- `packages/schema` owns collection definitions, compilation, validation, and descriptions. Its public entry point is `@aircastle/schema`.
- The core owns CMS operations and their rules. Keep feature-specific permissions, revisions, and review behavior with the feature. HTTP and agent tools call the same operations.
- The core defines the persistence operations it needs and which changes must be atomic. Database adapters implement those operations and transactions, keeping SQL and driver types private. The test-only `@aircastle/core/testing` entry exports the `ContentStore` contract suite. The core fake store and each adapter run it.
- The Postgres adapter owns SQL, row mapping, database constraints, and migrations for Aircastle's own tables. User collection migrations belong with the user's project when the eventual storage design requires them. Project collections share JSONB document storage within an instance-owned namespace. Content migration execution is deferred.
- `packages/contracts` owns browser-safe content result types, serialized collection contracts, compatibility and projection. It uses the schema package and has no server or SQL imports.
- `packages/client` owns developer configuration and the typed application HTTP client. `packages/cli` owns publication and lockfile workflows and communicates over HTTP.
- Browser code uses HTTP and browser-safe contracts. It does not import server implementations or executable collection configuration.

Local Postgres setup stays in the root `compose.yaml` and development scripts. Application migrations belong with their database adapter.

## Keeping the map current

Update this map in the same change that introduces, moves, removes, or changes the ownership of a module. Replace `planned` labels as those directories are implemented.

Show directories, responsibilities, and representative patterns. Add a file to the map only when it explains an important entry point or ownership rule. For unbuilt modules, show directories and intended responsibilities without inventing internal files. Do not create placeholder directories to match the map.
