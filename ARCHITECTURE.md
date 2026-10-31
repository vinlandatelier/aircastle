# Architecture

This map records module ownership and the pattern for organizing features. Entries marked `planned` describe intended locations that have not been built.

## Module map

```text
apps/
├── api/                      HTTP API and Bun startup
│   └── src/
│       ├── static.ts         Built browser assets and SPA HTTP boundary
│       └── features/         HTTP interfaces by feature
│           ├── health/       Process liveness and its response schema
│           ├── content/      Project schema publication and content HTTP routes
│           ├── auth/         Local auth boundary, library configuration, and behavior tests
│           └── development-inbox/  Local email capture interface and behavior tests
└── web/                      React admin
    ├── scripts/              Brand icon generation
    └── src/
        ├── components/       Shared presentation modules
        │   ├── shell/        Persistent header, sidebar, page frame, and supporting controls
        │   └── ui/           Local shadcn UI components built on Base UI
        ├── features/         Product behavior by feature
        │   ├── auth/         Browser auth state, setup and sign-in forms, confirmation, and development inbox
        │   ├── error-recovery/ App-wide fatal error boundary and standalone recovery
        │   ├── navigation/   Shared page catalog, sidebar navigation, and page search
        │   ├── not-found/    Public recovery page for unmatched destinations
        │   ├── sign-in/      Standalone setup and sign-in page layout and decorative background
        │   └── theme/        Client theme preference, persistence, and favicon
        ├── hooks/            Browser state subscriptions
        └── lib/              Browser-safe UI utilities

packages/
├── schema/                   Collection definitions, validation, and descriptions
├── contracts/                Shared content contracts, auth input validation, and compatibility
├── core/                     CMS operations, authorization, publication, and resource lifecycle
├── adapter-postgres/         Owned SQL storage, constraints, and migrations
├── client/                   Developer config and typed HTTP client
└── cli/                      Schema publication, reconciliation, and lockfiles

scripts/                      Repository checks and local development tooling
├── ai-automation/            Trigger-login authorization, PR context, and advisory review/fix publication
└── ai-models/                Pinned model roles and bounded Claude Code CLI runs

.github/                      CI workflows, shared setup, and model selections
```

The API assembles middleware, feature routes, and API documentation through `createApp({ logger, cms, auth, maxRequestBytes })` in `apps/api/src/app.ts`. Bun startup in `src/index.ts` validates environment configuration and constructs the logger, CMS, and configured auth runtime before listening. `packages/adapter-postgres` owns the shared environment-to-connection parser used by API startup and development provisioning. An explicit database URL takes precedence over granular database settings. Development auth owns injected Postgres storage and admission resources plus a process-local inbox. Shutdown drains HTTP requests, then closes auth and owned database resources in reverse allocation order; partial startup failures close resources already created. `src/cli.ts` exports a quiet app from the same factory with a silent logger and no `cms`, so it serves no content routes.

The server mounts every API route under `/api`, including `/api/docs` and `/api/openapi.json`. Feature routers use paths relative to that mount and follow the feature pattern below.

Vite forwards `/api` requests unchanged during development and preview. The built API owns the same prefix without Vite. `src/static.ts` serves the built browser and SPA refreshes on the same Bun listener, with GET/HEAD handling, no-referrer responses, and file-boundary checks. API misses stay API responses. The root `Dockerfile` packages this runtime and normal browser output; `compose.development.yaml` supplies explicit local auth and persistent Postgres with loopback ports. Production auth and hosting configuration remain deferred.

## Web app structure

Paths in this section are relative to `apps/web`.

- `src/App.tsx`, `src/main.tsx`, and `src/router.tsx` compose the app, providers, and routes. `src/features/theme` owns client-only light, dark, and system preferences, persistence, OS changes, and the favicon. `App` renders route-owned document metadata. A shared CMS layout under `/dash/workspaces/$workspaceId/projects/$projectId` keeps the shell mounted as dashboard destinations change; authentication pages render outside that layout.
- `src/components/shell/` owns the persistent header, sidebar, page frame, and private supporting controls. The sidebar collapses independently beneath the full-width header. Import the shell through its `index.tsx` entry point.
- `src/components/ui/` holds shared UI primitives built on Base UI.
- `src/features/<feature>/` owns a product feature's behavior, types, data fetching, and tests. Import features through their `index.ts` or `index.tsx` entry point; keep supporting files private.
- Keep feature-specific hooks and helpers inside their feature. Reserve `src/hooks/` and `src/lib/` for shared browser subscriptions and utilities.
- Keep public-interface behavior tests beside the module implementation. Add feature folders only when implementing their behavior.

Public routes render without resolving authentication, including when local auth is disabled or unavailable. Unknown public paths show the not-found recovery page. Auth resolution applies to `/dash` and its descendants, setup, sign-in, and the development inbox.

`src/features/navigation` owns the page catalog, sidebar links, and keyboard page search. `src/router.tsx` registers destinations and their document titles under `/dash/workspaces/$workspaceId/projects/$projectId` from that catalog. `src/features/auth` owns browser HTTP, session resolution, setup/sign-in forms, confirmation, the development inbox, and workspace entry placeholders. Route guards request server authority and destinations before rendering the protected shell. Each router owns its auth state, and shell account controls receive identity and sign-out through props. The project base redirects to its collections page. `/` reserves the marketing entry with a minimal branded placeholder and its landing-page metadata. Dashboard destinations currently render placeholders. `components.json` configures shadcn and the Efferd registry.

`src/features/sign-in` vendors the Efferd `@efferd/auth-5` presentation with Aircastle branding. The auth feature supplies form state and actions. Legal links open `/terms-of-service` and `/privacy-policy` in new tabs; those pages are not implemented yet.

`src/features/not-found` owns the standalone recovery page for unmatched destinations, including unknown dashboard paths. The router handles these at its root so the page uses the marketing palette outside the CMS shell. Its links return to `/` or `/sign-in`; sign-in's Home link also returns to `/`.

`src/features/error-recovery` catches rendering failures outside the router and listens for uncaught runtime errors and unhandled promise rejections. Route render and loader failures reach that boundary because no route defines an error component and the router's generic global error boundary is disabled. Recovery unmounts the failed app and its metadata, retains the document theme or resolves it for an early failure, and renders without router or theme-provider dependencies. Reload retries the current URL; Home performs a full navigation to `/`. Handled failures and ordinary missing pages keep their existing behavior.

`src/index.css` owns the `marketing` and `dashboard` colour palettes in light and dark mode. Marketing uses Efferd's auth preview tokens and is the default for public pages. Sign-in declares `data-theme-scope="marketing"`; the shell declares `data-theme-scope="dashboard"`. The dashboard marker selects its palette at the document root, including overlays rendered outside the shell. Shared UI components consume the active semantic tokens without separate component variants or theme providers.

Colocated component tests use Vite+ and happy-dom. `e2e/` owns Chromium journeys and extreme-input fixtures. Fixture builds set `WEB_FIXTURES=1`, and a Vite plugin then swaps `src/components/shell/data.ts` and `src/features/navigation/pages.ts` for the modules in `e2e/fixture-modules/` by resolved path, so every import spelling gets the fixture. It also swaps `src/main.tsx` for `e2e/fixture-entry.tsx`, which mounts the real router with a display-only auth transport. Normal production builds retain their real data and expose no fixture controls. `tsconfig.e2e.json` type-checks the Playwright config, journeys and fixture modules.

`playwright.config.ts` owns browser execution. Its `webServer` entries build the normal and fixture apps and preview them on `WEB_E2E_PORT` and the next port, which `e2e/origins.ts` derives for both the config and the `visit` helper. Playwright starts and stops those servers, rejects `.only`, retries and flaky passes, and writes HTML and JSON reports, traces, and screenshots to the ignored `reports/` directory. A third `webServer` entry runs `tests/web/auth-instances.ts`, which gives each auth journey its own Bun API process, Postgres namespace and same-origin preview of the normal build; the test API child controls time over IPC. Root browser recipes allocate disposable Postgres for those journeys. Lint keeps process spawning, server launchers and skipped journeys out of `apps/web`, so new verification goes into Playwright or Vitest configuration rather than a custom runner. Coverage measures TypeScript execution, including unimported source; it does not measure CSS or establish correctness. [Frontend verification](apps/web/VERIFICATION.md) defines the feature workflow. Browser cases use descriptive file, suite and test names without a central registry.

## Repository automation

`scripts/ai-automation/index.ts` owns review/fix authorization, output validation, and prompts. Its review lenses define the two review passes: one hunts for correctness failures, the other checks quality and conformance with `AGENTS.md`. `github.ts` holds the coordinator, which owns immutable source capture, authenticated claims, revision checks, and publication. The workflow uses trusted default-branch code and accepts only the single GitHub account named by the `AI_TRIGGER_LOGIN` and `AI_TRIGGER_USER_ID` repository variables as a requester before model calls. A new PR conversation comment from that account mentioning `@vinland-ai` triggers work directly. `operations.ts` resolves natural requests in the model job, asks the requester one question on the PR when a request is unclear, binds the chosen task and model to the original claim, and keeps natural fixes behind the existing secretless verifier. `reviews.ts` runs independent correctness and quality passes with the configured reviewer, then builds one compact severity-ordered review with inline findings on supported diff ranges. The publisher uses the stock GitHub review endpoint and `diff` to parse unified hunks. It does not scan historical commands or PR revisions. Failed operations can be retried by posting a new tag. Source and model output remain data in credential-bearing jobs. Supported fixes run selected file-level checks in a separate container and publish through a fresh trusted job as follow-up PRs. Fixes for fork PRs are published only as patches. Unsupported scopes produce explicitly unverified patch artifacts without executing repository checks.

`scripts/ai-models/index.ts` owns the reviewer and implementer config parser and the Claude Code CLI transport. It runs `claude -p` on the subscription token in an empty directory with a fresh configuration, no tools, and no MCP servers. Callers supply task text and a bounded output schema. `tests/harness/ai-credentials.test.ts` keeps provider API keys and endpoints out of the automation. `.github/ai-models.json` pins each role's model and effort.

Privileged workflows use the `ai-automation` environment, restricted to the `main` branch. [Automation instructions](.github/AGENTS.md) record the activation requirements and trust boundaries. Live setup is distinct from offline configuration validation.

`.github/workflows/gardener.yml` runs the `.agents/skills/gardener` audit of `main` on the subscription token without GitHub credentials, and a separate job opens the resulting PRs with the AI App token. `tests/harness/gardener-workflow.test.ts` guards its secrets, token scope, held paths and merge calls.

`.github/workflows/mutation.yml` runs full schema and contract mutation testing nightly or on demand. AI workflows are advisory and do not participate in the required check, approval counts, or conversation-resolution requirements.

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
├── index.ts          Public factory, route descriptions, handlers, and input checks
├── request.ts        Credentials and bounded JSON body parsing
├── responses.ts      Result status mapping and sanitized error responses
└── index.test.ts     HTTP behavior through createApp
```

`apps/api/AGENTS.md` describes how API routes declare schemas, how content routes check input, and where handlers go. Test supporting files through the feature's public behavior; do not export them from the entry point solely for tests.

`tests/harness/module-boundaries.test.ts` fails when a file under `apps/api/src` or `apps/web/src` reaches into another feature's or the web shell's private files through a relative or web `@/` static import, re-export, import-type query, `import x = require`, dynamic `import()`, `require`, or `createRequire` loader. Lint and `vp run check:policy` enforce the browser boundary and imports between workspaces. Lint also keeps auth and HTTP libraries out of browser-safe code and keeps HTTP, auth libraries, and database drivers out of `packages/core/src`.

This is a general pattern, not a required file inventory for every module. Existing modules can adopt it when relevant work warrants a change.

## Ownership

- `apps/api` translates HTTP requests and agent tool calls into CMS operations. It owns transport schemas, logging integration, API documentation, and runtime resource assembly. Keep startup configuration outside feature handlers.
- `apps/web` owns the admin shell, local UI components, and browser state. Its module layout and entry points are described in [Web app structure](#web-app-structure).
- `packages/schema` owns collection definitions, compilation, validation, and descriptions. Its public entry point is `@aircastle/schema`.
- The core owns CMS operations and their rules. Keep feature-specific permissions, revisions, and review behavior with the feature. HTTP and agent tools call the same operations.
- The core defines the persistence operations it needs and which changes must be atomic. Database adapters implement those operations and transactions, keeping SQL and driver types private. The test-only `@aircastle/core/testing` entry exports the `ContentStore` contract suite. The core fake store and each adapter run it.
- The core defines auth records, transactional persistence operations, session and entry state, and request-admission limits and outcomes. The Postgres adapter implements auth transactions, namespace-aware initialization, a separate auth migration ledger, and persistent local signing material. Setup completion and issuance markers survive deletion of their associated user or current link. Durable request admission records rolling-window timestamps in Postgres and coordinates active limit policies with database locks. Each instance holds one connection for policy ownership; transaction guards reject admission under a changed policy after reconnecting. Crashes release ownership without stale process records.
- The Postgres adapter owns SQL, row mapping, database constraints, and migrations for Aircastle's own tables. User collection migrations belong with the user's project when the eventual storage design requires them. Project collections share JSONB document storage within an instance-owned namespace. Content migration execution is deferred.
- `packages/contracts` owns browser-safe content result types, serialized collection contracts, compatibility and projection. It uses the schema package and has no server or SQL imports.
- Shared auth input schemas also live in `packages/contracts`. They normalize and validate email and display names with ArkType, rejecting undeclared fields. API auth configuration uses the same email validator for its optional initial identity and validates explicit local mode, browser origin, and request ceilings at startup. The API development inbox retains the newest 100 complete messages in memory, with shared read state and isolated snapshots. Its preparation/publication boundary keeps pending captures invisible and makes commit/abort idempotent, so a failed durable link replacement need not expose a message. Each runtime factory starts with an empty inbox.
- The API auth feature owns request guards, credential issuance and confirmation, session activity, durable dashboard entry, bounded diagnostics, and its private Better Auth bridge. The bridge binds user/session writes to the exact core transaction. Its shared library and plugin factories define the configured endpoint inventory; the HTTP boundary closes raw library routes. Credential coordination publishes prepared inbox messages only after a known commit and resolves lost acknowledgments through durable issuance markers. Application startup owns construction and shutdown of injected resources.
- `packages/client` owns developer configuration and the typed application HTTP client. `packages/cli` owns publication and lockfile workflows and communicates over HTTP.
- Browser code uses HTTP and browser-safe contracts. It does not import server implementations or executable collection configuration.

Local Postgres setup stays in the root `compose.yaml` and development scripts. Application migrations belong with their database adapter.

## Keeping the map current

Update this map in the same change that introduces, moves, removes, or changes the ownership of a module. Replace `planned` labels as those directories are implemented.

Show directories, responsibilities, and representative patterns. Add a file to the map only when it explains an important entry point or ownership rule. For unbuilt modules, show directories and intended responsibilities without inventing internal files. Do not create placeholder directories to match the map.
