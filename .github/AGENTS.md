# Repository automation

Follow [the architecture map](../ARCHITECTURE.md) for tooling ownership.

- `ci.yml` owns deterministic pull-request verification. It runs checks as parallel jobs and shards browser journeys with a matrix. The `Lint, typecheck and test` gate job needs every check job and fails unless all succeeded; it is the only required status check, so a new check job must join its `needs` list. Schema coverage below the thresholds in `packages/schema/vite.config.ts` fails the gate; the coverage table and the 10 slowest browser journeys are in the run's summary page, not a PR comment. Each browser shard uploads its Playwright JSON report as a `browser-results-<shard>` artifact.
- `mutation.yml` runs full schema and contract mutation testing nightly or on demand. It is not a pull-request check.
- `rulesets/main.json` is the ruleset on `main`: pull requests only, the `Lint, typecheck and test` check required, a merge queue that squash-merges each green PR as soon as it is green, and no force pushes or deletions. Apply a change with `gh api -X PUT repos/vinlandatelier/aircastle/rulesets/<id> --input .github/rulesets/main.json`. The squash commit lists every commit author as a co-author, which is how the owner's contributions stay credited on bot-authored PRs.
- `CODEOWNERS` names the paths whose PRs the repository owner reviews before merge: workflows and automation, agent instructions, auth, migrations and public documentation. Agents open PRs as `abyan-ai-integration` so the owner can approve them.
- Workflows run no AI models. AI review and the gardener audit run locally.
- Pin third-party actions by full commit SHA. Keep ordinary pull-request CI read-only and checkout credential persistence disabled.
