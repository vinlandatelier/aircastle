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
        ├── components/       Efferd app shell and its layout components
        │   └── ui/           Local shadcn UI components built on Base UI
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
- Use blank lines to separate logical steps, such as parsing input, validating it, and calling an operation.

The API content feature separates HTTP mechanics behind the same public factory:

```text
content/
├── index.ts          Public factory, route schemas, handlers, and endpoint guards
├── request.ts        Credentials and bounded JSON body parsing
├── responses.ts      Result status mapping and safe error responses
└── index.test.ts     HTTP behavior through createApp
```

Keep route schemas and handlers together and preserve inferred router return types. Test supporting files through the feature's public behavior; do not export them from the entry point solely for tests.

The module-boundary harness scans TypeScript callers under the API and web source roots for private imports into API features, web features, and the web shell. It checks static imports, re-exports, and TypeScript import-type queries using relative paths or the web `@/` alias. Runtime dynamic imports, CommonJS imports, other path resolvers, and dependency cycles are outside its scope.

This is a general pattern, not a required file inventory for every module. Existing modules can adopt it when relevant work warrants a change.

## Ownership

- `apps/api` translates HTTP requests and agent tool calls into CMS operations. It owns transport schemas, logging integration, API documentation, and runtime resource assembly. Keep startup configuration outside feature handlers.
- `apps/web` owns the admin shell, local UI components, and browser state. `App` composes the shell through `components/app-shell.tsx` and provides light, dark, and system themes with `next-themes`. The full-width header owns the fixed brand cell and header actions. The sidebar collapses independently beneath it. The Efferd layout uses shadcn components and displays sample navigation and dashboard placeholders. `apps/web/components.json` configures shadcn and the Efferd registry.
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
