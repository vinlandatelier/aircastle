# Repository automation

Follow [the architecture map](../ARCHITECTURE.md) for tooling ownership.

- `ci.yml` owns deterministic pull-request verification. Its `Lint, typecheck and test` job is the only required status check. Schema coverage below the thresholds in `packages/schema/vite.config.ts` fails that job; the coverage table is in the run's summary page, not a PR comment.
- `mutation.yml` runs full schema and contract mutation testing nightly or on demand. It is not a pull-request check.
- Workflows run no AI models. AI review and the gardener audit run locally.
- Pin third-party actions by full commit SHA. Keep ordinary pull-request CI read-only and checkout credential persistence disabled.
