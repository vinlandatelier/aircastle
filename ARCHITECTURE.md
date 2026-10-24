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
        │   ├── navigation/   Shared page catalog, sidebar navigation, and page search
        │   └── sign-in/      Standalone email sign-in interface and decorative background
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
```

The API assembles middleware, feature routes, and API documentation through `createApp({ logger })` in `apps/api/src/app.ts`. Bun startup in `src/index.ts` validates environment configuration, constructs the logger and CMS runtime, and initializes owned storage before listening. Shutdown stops accepting requests, drains CMS operations, and closes storage. `src/cli.ts` exports a quiet app using the same factory with a silent logger.

The server mounts every API route under `/api`, including `/api/docs` and `/api/openapi.json`. Feature routers use paths relative to that mount and follow the feature pattern below.

Vite forwards `/api` requests unchanged during development and preview. The built API owns the same prefix without Vite. Hosted routing must forward `/api` unchanged to Bun. Production admin serving and deployment configuration are not implemented yet.

## Web app structure

Paths in this section are relative to `apps/web`.

- `src/App.tsx`, `src/main.tsx`, and `src/router.tsx` compose the app, providers, and routes. `App` provides light, dark, and system themes with `next-themes` and renders route-owned document metadata. A shared CMS layout under `/dash/workspaces/$workspaceId/projects/$projectId` keeps the shell mounted as dashboard destinations change; `/` and `/sign-in` render outside that layout.
- `src/components/shell/` owns the persistent header, sidebar, page frame, and private supporting controls. The sidebar collapses independently beneath the full-width header. Import the shell through its `index.tsx` entry point.
- `src/components/ui/` holds shared UI primitives built on Base UI.
- `src/features/<feature>/` owns a product feature's behavior, types, data fetching, and tests. Import features through their `index.ts` or `index.tsx` entry point; keep supporting files private.
- Keep feature-specific hooks and helpers inside their feature. Reserve `src/hooks/` and `src/lib/` for shared browser subscriptions and utilities.
- Keep public-interface behavior tests beside the module implementation. Add feature folders only when implementing their behavior.

`src/features/navigation` owns the page catalog, sidebar links, and keyboard page search. `src/router.tsx` registers destinations and their document titles under `/dash/workspaces/$workspaceId/projects/$projectId` from that catalog. Dashboard navigation preserves both route parameters, which currently accept arbitrary nonempty values without a workspace or project lookup. The project base redirects to its collections page. `/dash` redirects to `/dash/workspaces/demo/projects/demo/collections`; `/` reserves the marketing entry with a minimal branded placeholder and its landing-page metadata. Dashboard destinations currently render placeholders. `components.json` configures shadcn and the Efferd registry.

`src/features/sign-in` vendors the Efferd `@efferd/auth-5` layout with Aircastle branding and email-only controls. The email action remains disabled until magic-link authentication is implemented. Legal links open `/terms-of-service` and `/privacy-policy` in new tabs; those pages are not implemented yet.

`src/index.css` owns the `marketing` and `dashboard` colour palettes in light and dark mode. Marketing uses Efferd's auth preview tokens and is the default for public pages. Sign-in declares `data-theme-scope="marketing"`; the shell declares `data-theme-scope="dashboard"`. The dashboard marker selects its palette at the document root, including overlays rendered outside the shell. Shared UI components consume the active semantic tokens without separate component variants or theme providers.

Colocated component tests use Vite+ and happy-dom. `e2e/` owns Chromium journeys, extreme-input fixtures, and command/report conformance tests. `playwright.config.ts` owns browser execution settings. A verification-only Vite adapter supplies fixture data before rendering; normal production builds retain their real data and expose no fixture controls.

`scripts/verify-web.ts` owns verification commands and evidence. Browser runs build and serve isolated normal and fixture outputs on allocated ports, use fresh browser contexts, and clean up their own servers. Reports, coverage, traces, and screenshots stay in ignored per-run output directories. Coverage measures TypeScript execution, including unimported source; it does not measure CSS or establish correctness. [Frontend verification](apps/web/VERIFICATION.md) defines the feature workflow. Browser cases use descriptive file, suite and test names; the receipt records the selected cases without a central registry. The strength command runs the bounded fault cases in disposable verification sandboxes; source copies and reports belong to verification tooling.

## Feature pattern

The folder names the feature. Start with its implementation and public-interface tests together:

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

This is a general pattern, not a required file inventory for every module. Existing modules can adopt it when relevant work warrants a change.

## Ownership

- `apps/api` translates HTTP requests and agent tool calls into CMS operations. It owns transport schemas, logging integration, API documentation, and runtime resource assembly. Keep startup configuration outside feature handlers.
- `apps/web` owns the admin shell, local UI components, and browser state. Its module layout and entry points are described in [Web app structure](#web-app-structure).
- `packages/schema` owns collection definitions, compilation, validation, and descriptions. Its public entry point is `@aircastle/schema`.
- The core owns CMS operations and their rules. Keep feature-specific permissions, revisions, and review behavior with the feature. HTTP and agent tools call the same operations.
- The core defines the persistence operations it needs and which changes must be atomic. Database adapters implement those operations and transactions, keeping SQL and driver types private.
- The Postgres adapter owns SQL, row mapping, database constraints, and migrations for Aircastle's own tables. User collection migrations belong with the user's project when the eventual storage design requires them. Project collections share JSONB document storage within an instance-owned namespace. Content migration execution is deferred.
- `packages/contracts` owns browser-safe content result types, serialized collection contracts, compatibility and projection. It uses the schema package and has no server or SQL imports.
- `packages/client` owns developer configuration and the typed application HTTP client. `packages/cli` owns publication and lockfile workflows and communicates over HTTP.
- Browser code uses HTTP and browser-safe contracts. It does not import server implementations or executable collection configuration.

Local Postgres setup stays in the root `compose.yaml` and development scripts. Application migrations belong with their database adapter.

## Keeping the map current

Update this map in the same change that introduces, moves, removes, or changes the ownership of a module. Replace `planned` labels as those directories are implemented.

Show directories, responsibilities, and representative patterns. Add a file to the map only when it explains an important entry point or ownership rule. For unbuilt modules, show directories and intended responsibilities without inventing internal files. Do not create placeholder directories to match the map.
