# Repository automation

Follow [the architecture map](../ARCHITECTURE.md) for tooling ownership.

- `quality.yml` owns deterministic pull-request verification. `Quality` is the only required status check.
- AI reviews are advisory. Keep them outside `Quality`, required approvals, and required conversation resolution. Never enable automatic merging.
- Run privileged AI operations from trusted default-branch code with the `ai-automation` environment. Keep that environment restricted to the `main` branch, with no tag policies.
- Current organization membership authorizes AI spending. Repository collaborator permissions and comment text do not prove membership.
- PR files and model output are untrusted data. Execute generated or PR code only in verification jobs without provider, membership, or publishing credentials.
- `.github/ai-models.json` selects review and implementation roles. Model changes require compatibility and role-evaluation evidence; discovery metadata alone does not establish quality.
- Pin third-party actions by full commit SHA. Keep ordinary pull-request CI read-only and checkout credential persistence disabled.
