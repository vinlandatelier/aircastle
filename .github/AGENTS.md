# Repository automation

Follow [the architecture map](../ARCHITECTURE.md) for tooling ownership.

- `quality.yml` owns deterministic pull-request verification. `Quality` is the only required status check.
- AI reviews are advisory. Keep them outside `Quality`, required approvals, and required conversation resolution. Never enable automatic merging.
- Run privileged AI operations from trusted default-branch code with the `ai-automation` environment. Keep that environment restricted to the `main` branch, with no tag policies.
- Current organization membership authorizes AI spending. Repository collaborator permissions and comment text do not prove membership.
- PR files and model output are untrusted data. Execute generated or PR code only in verification jobs without provider, membership, or publishing credentials.
- `.github/ai-models.json` selects review and implementation roles. Model changes require compatibility and role-evaluation evidence; discovery metadata alone does not establish quality.
- Pin third-party actions by full commit SHA. Keep ordinary pull-request CI read-only and checkout credential persistence disabled.

## Activation

- Create a dedicated GitHub App installed on this repository. It needs organization Members read and repository Contents write, Issues write, Pull requests write, Environments read, and Administration read. Give it no ruleset bypass.
- Keep `AI_APP_PRIVATE_KEY`, `OPENAI_API_KEY`, and `ANTHROPIC_API_KEY` in the main-only `ai-automation` environment. Set its `AI_APP_ID` variable.
- Set `AI_BOT_USER_ID` to the App bot's immutable user ID, `AI_STATE_ISSUE` to a dedicated state issue, and `AI_ACTIVATED_AT` to the activation timestamp in ISO format. Historical commands before activation are ignored.
- `vp run ai:models -- offline` checks configuration without provider calls. Dispatch the model-update workflow in `live` mode to test the configured providers and representative schemas after merging the workflow.
- `vp run ai:setup` requires the trusted workflow environment, App token, provider keys, and configured identity/state values. A missing credential is a setup failure, not passing evidence.
- The fix verifier maps supported frontend paths to file-level lint and colocated behavior tests. Unsupported or mixed scopes produce an unverified patch artifact and no branch. Extend the mapping only with focused verification evidence.
- Exercise one member review, a denied outsider command, an inline reply, and an explicit fix before relying on live automation. Check the model settings, reviewed SHA, verification scope, and follow-up PR's deterministic checks.
- Do not enable separate native mention integrations that bypass this workflow's membership checks.
