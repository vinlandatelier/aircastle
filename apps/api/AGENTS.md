# API agent tools

- `src/app.ts` exports `createApp({ logger })`. `src/index.ts` reads configuration and starts Bun; `src/cli.ts` exports a quiet app for CLI use.
- The CLI entry loads the app through native module resolution because the pinned CLI bundles CommonJS dependencies incorrectly. Its working directory is `apps/api`, set by the root command.
- From the repository root, run `vp run hono-api --help` first.
- Inspect routes with `vp run hono-api routes src/cli.ts`.
- Send requests with `vp run hono-api request /api/health src/cli.ts --runtime bun`.
- Use `vp run hono-api batch - src/cli.ts` for JSONL request sequences. Batch runs on Node by default; it does not support Bun in the pinned CLI release.
- Use the CLI for API exploration without starting a server. Keep regression tests in Vitest and run them with `vp run test-api`.
- For the built API startup, CLI/SDK durability, request limits and shutdown, run `vp run build`, then `vp run db:test -- vp test tests/content-workflow.test.ts` from the repository root. The workflow uses the production entry and an isolated database.
- Find Hono documentation through `https://hono.dev/llms.txt`; fetch individual pages with `Accept: text/markdown`.

- Keep route schemas and handlers together. Use ArkType with `describeRoute`/`resolver` for OpenAPI and `satisfies typeof schema.infer` for response types. Keep typed-client assertions in feature tests.
- Keep each feature's public factory in `index.ts`; extract distinct request and response responsibilities into private supporting files as needed. Use blank lines between logical steps. See the feature pattern in `ARCHITECTURE.md`.
