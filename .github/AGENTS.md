# Repository automation

Follow [the architecture map](../ARCHITECTURE.md) for tooling ownership.

- `ci.yml` owns deterministic pull-request verification. It runs checks as parallel jobs and shards browser journeys with a matrix. The `Lint, typecheck and test` gate job needs every check job and fails unless all succeeded; it is the only required status check, so a new check job must join its `needs` list. Schema coverage below the thresholds in `packages/schema/vite.config.ts` fails the gate; the coverage table and the 10 slowest browser journeys are in the run's summary page, not a PR comment. Each browser shard uploads its Playwright JSON report as a `browser-results-<shard>` artifact.
- `mutation.yml` runs full schema and contract mutation testing nightly or on demand. It is not a pull-request check.
- `rulesets/main.json` is the ruleset on `main`: pull requests only, the `Lint, typecheck and test` check required, a merge queue that squash-merges each green PR as soon as it is green, and no force pushes or deletions. Apply a change with `gh api -X PUT repos/vinlandatelier/aircastle/rulesets/<id> --input .github/rulesets/main.json`. The squash commit lists every commit author as a co-author, which is how the owner's contributions stay credited on bot-authored PRs.
- `CODEOWNERS` names the paths whose PRs the repository owner reviews before merge: workflows and automation, agent instructions, auth, migrations and public documentation. Agents open PRs as `abyan-ai-integration` so the owner can approve them.
- Workflows run no AI models. AI review and the gardener audit run locally.
- Pin third-party actions by full commit SHA. Keep ordinary pull-request CI read-only and checkout credential persistence disabled. The gate job alone gets `statuses: write`, to post the `CI latency` status, and `actions: read`, to read the run's jobs.

## Latency

The required check's critical path has a budget of 150 s, set once as `CI_LATENCY_BUDGET_SECONDS` in `ci.yml`. Main ran in about 92 s when the budget was set, so 150 s leaves room for runner variance and still flags a real regression. The gate measures from the first job's start to the last finished job's end, so queue time before the first job does not count. Going over the budget never fails CI.

- `gh pr checks` shows the number in the `CI latency` row. The gate posts it as a commit status; it is not a required check.
- An over-budget run adds a `CI latency` warning annotation, shown by `gh run view <id>`.
- The gate's summary starts with `## CI critical path: <n> s (budget 150 s)`, followed by each job's duration.
- `gh run download <id> -n ci-latency` fetches the same numbers as JSON. The `browser-results-<shard>` artifacts hold each journey's duration.

To cut latency, try these in order: move work into a parallel job, cache it, shard it, then shorten it.
