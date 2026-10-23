# API agent tools

- `src/app.ts` exports the Hono app. `src/index.ts` configures Bun's server.
- From the repository root, run `vp run hono-api --help` first.
- Inspect routes with `vp run hono-api routes src/app.ts`.
- Send requests with `vp run hono-api request /health src/app.ts --runtime bun`.
- Use `vp run hono-api batch - src/app.ts` for JSONL request sequences. Batch runs on Node by default; it does not support Bun in the pinned CLI release.
- Use the CLI for API exploration without starting a server. Keep regression tests in Vitest and run them with `vp run test-api`.
- Find Hono documentation through `https://hono.dev/llms.txt`; fetch individual pages with `Accept: text/markdown`.
