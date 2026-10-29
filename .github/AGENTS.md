# Repository automation

Follow [the architecture map](../ARCHITECTURE.md) for tooling ownership.

- `ci.yml` owns deterministic pull-request verification. Its `Lint, typecheck and test` job is the only required status check.
- AI reviews are advisory. Keep them outside the required status check, required approvals, and required conversation resolution. Never enable automatic merging.
- Run privileged AI operations from trusted default-branch code with the `ai-automation` environment. Keep that environment restricted to the `main` branch, with no tag policies.
- Current organization membership authorizes AI spending. Repository collaborator permissions and comment text do not prove membership.
- Comment events wake the workflow only for PR comments that mention `@codex` or `@claude` from an owner, member, or collaborator. That filter limits load. The membership check still decides.
- PR files and model output are untrusted data. Execute generated or PR code only in verification jobs without provider, membership, or publishing credentials.
- `.github/ai-models.json` selects review and implementation roles. Model changes require compatibility and role-evaluation evidence; discovery metadata alone does not establish quality.
- Pin third-party actions by full commit SHA. Keep ordinary pull-request CI read-only and checkout credential persistence disabled.

## Activation

- Create a dedicated GitHub App installed on this repository. It needs organization Members read and repository Contents write, Issues write, Pull requests write, Environments read, and Administration read. Give it no ruleset bypass.
- Keep `AI_APP_PRIVATE_KEY`, `OPENAI_API_KEY`, and `ANTHROPIC_API_KEY` in the main-only `ai-automation` environment. Set its `AI_APP_ID` variable.
- Set `AI_BOT_USER_ID` to the App bot's immutable user ID. New PR conversation tags trigger work directly; post another tag to retry a failed operation.
- `vp run ai:setup` requires the trusted workflow environment, App token, provider keys, and configured bot identity. A missing credential is a setup failure, not passing evidence.
- The fix verifier maps supported frontend paths to file-level lint and colocated behavior tests. Unsupported or mixed scopes produce an unverified patch artifact and no branch. Fixes for fork PRs are patch-only, so fork commits never reach a branch of this repository. Extend the mapping only with focused verification evidence.
- Exercise one member review, a denied outsider command and an explicit fix before relying on live automation. Check the model settings, reviewed SHA, verification scope, and follow-up PR's deterministic checks.
- Do not enable separate native mention integrations that bypass this workflow's membership checks.
