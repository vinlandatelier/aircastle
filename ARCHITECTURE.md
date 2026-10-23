# Architecture

This map records module ownership and the pattern for organizing features. Entries marked `planned` describe intended locations that have not been built.

## Module map

```text
apps/
├── api/                      HTTP API and Bun startup
│   └── src/
│       └── features/         planned: HTTP and agent interfaces by feature
└── web/                      React admin

packages/
├── schema/                   Collection definitions, validation, and descriptions
├── core/                     planned: CMS operations and rules
└── adapter-postgres/         planned: Postgres persistence and migrations

scripts/                      Repository checks and local development tooling
```

The API currently implements health directly in `apps/api/src/app.ts`. The feature-directory pattern below is the convention for new feature modules; it does not describe an existing health directory.

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
- `packages/schema` owns collection definitions, compilation, validation, and descriptions. Its public entry point is `@aircastle/schema`.
- The planned core owns CMS operations and their rules. Keep feature-specific permissions, revisions, and review behavior with the feature. HTTP and agent tools call the same operations.
- The planned core defines the persistence operations it needs and which changes must be atomic. Database adapters implement those operations and transactions, keeping SQL and driver types private.
- The planned Postgres adapter owns SQL, row mapping, database constraints, and migrations for Aircastle's own tables. User collection migrations belong with the user's project when the eventual storage design requires them. Collection storage and migration formats remain undecided.
- Browser code uses HTTP and browser-safe contracts. It does not import server implementations or executable collection configuration.

Local Postgres setup stays in the root `compose.yaml` and development scripts. Application migrations belong with their database adapter.

## Keeping the map current

Update this map in the same change that introduces, moves, removes, or changes the ownership of a module. Replace `planned` labels as those directories are implemented.

Show directories, responsibilities, and representative patterns. Add a file to the map only when it explains an important entry point or ownership rule. For unbuilt modules, show directories and intended responsibilities without inventing internal files. Do not create placeholder directories to match the map.
