# Repository automation

Follow [the architecture map](../ARCHITECTURE.md) for tooling ownership.

- `ci.yml` owns deterministic pull-request verification. Its `Lint, typecheck and test` job is the only required status check.
- AI reviews are advisory. Keep them outside the required status check, required approvals, and required conversation resolution. Never enable automatic merging.
- Run privileged AI operations from trusted default-branch code with the `ai-automation` environment. Keep that environment restricted to the `main` branch, with no tag policies.
- AI runs spend the repository owner's personal Claude subscription. Only the account matching both `AI_TRIGGER_LOGIN` and `AI_TRIGGER_USER_ID` may trigger them, because Anthropic's consumer terms forbid making the account available to anyone else. Organization membership, collaborator permissions, and comment text grant nothing.
- Comment events wake the workflow only for PR comments that mention `@vinland-ai` from the trigger account. The coordinator checks the same login and user ID again before every claim.
- Never use provider API keys. `tests/harness/ai-credentials.test.ts` fails when automation code or workflows mention a key or a provider API endpoint. The model runner starts the Claude Code CLI with only `PATH`, a temporary `HOME` and config directory, and the subscription token in its environment, so a key elsewhere in the job never reaches it.
- `gardener.yml` audits `main` weekly with `.agents/skills/gardener`. It opens at most three PRs per run, labels them `gardener` and `ready-for-human-approval`, and never merges. A PR that changes guardrail files gets `touches-guardrails` instead of `ready-for-human-approval`. Only its publish job holds write rights, and that job runs no model or repository code.
- The gardener's Claude run uses `.github/gardener-settings.json` instead of skipping permissions. Shell commands run in the Claude Code sandbox with the OAuth token removed, network limited to the npm registry, and Docker stopped. Claude sees only number, title, branch and state of the trigger account's PRs and `gardener` PRs. The audit job uploads only its output directory and never saves the dependency cache.
- PR files and model output are untrusted data. Execute generated or PR code only in verification jobs without model or publishing credentials.
- `.github/ai-models.json` selects the model and effort for the reviewer and the implementer. Both roles run on the pinned Claude Code CLI. Model changes require compatibility and role-evaluation evidence; discovery metadata alone does not establish quality.
- Pin third-party actions by full commit SHA. Keep ordinary pull-request CI read-only and checkout credential persistence disabled.

## Activation

- Create a dedicated GitHub App installed on this repository. It needs repository Contents write, Issues write, Pull requests write, Environments read, and Administration read. Give it no ruleset bypass.
- Keep `AI_APP_PRIVATE_KEY` and `CLAUDE_CODE_OAUTH_TOKEN` in the main-only `ai-automation` environment. The owner creates the token with `claude setup-token` on a Pro or Max plan. Set the environment's `AI_APP_ID` variable.
- Set the repository variables `AI_TRIGGER_LOGIN` to the owner's GitHub login and `AI_TRIGGER_USER_ID` to the owner's numeric user ID (`gh api users/<login> --jq .id`). They must be repository variables, not environment variables, because the job-level `if` that filters comment events runs before the job's environment loads. Logins can be renamed and re-registered, so the coordinator also requires the user ID.
- Runs count against the owner's plan usage limits. Each review runs two passes, and each natural request runs one classification call first. They share those limits with the owner's own Claude use.
- Set `AI_BOT_USER_ID` to the App bot's immutable user ID. New PR conversation comments use `@vinland-ai review` or `@vinland-ai fix ...` to select the role. A bare `@vinland-ai` requests both correctness and quality passes. Clear natural change requests select implementation without requiring `fix`; unclear requests get one clarification question as a PR comment. Post another tag to retry a failed operation.
- `vp run ai:setup` requires the trusted workflow environment, App token, `CLAUDE_CODE_OAUTH_TOKEN`, the Claude Code CLI on `PATH`, and configured bot identity and trigger values. A missing credential is a setup failure, not passing evidence.
- Publish both review passes as one advisory COMMENT review, with concise severity-ordered findings and inline comments on supported diff ranges. A failed pass fails the operation; post a new tag to retry.
- The fix verifier maps supported frontend paths to file-level lint and colocated behavior tests. Unsupported or mixed scopes produce an unverified patch artifact and no branch. Fixes for fork PRs are patch-only, so fork commits never reach a branch of this repository. Extend the mapping only with focused verification evidence.
- Exercise one owner review, a denied command from another user and an explicit fix before relying on live automation. Check the model settings, reviewed SHA, verification scope, and follow-up PR's deterministic checks.
- The gardener's publish job pushes branches and opens PRs with the AI App token, scoped to Contents write and Pull requests write. It needs no secret or repository setting beyond the ones above, and its PRs start `ci.yml` like any other PR. Keep the App without the Workflows permission. The publish job holds for the owner any branch that touches automation or its guards; `tests/harness/gardener-workflow.test.ts` pins that path list.
- Do not enable separate native mention integrations that bypass this workflow's trigger-login checks.
