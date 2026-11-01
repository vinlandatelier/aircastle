# Aircastle agent instructions

Aircastle is a standalone headless CMS with code-defined collections. These instructions apply throughout the repository.

## Architecture

- Follow [ARCHITECTURE.md](ARCHITECTURE.md) for the module map and feature pattern. Update it in the same change when module locations or ownership change, including when planned modules are implemented. These maintenance updates are authorized; keep the map at module level rather than listing every file.
- Design deep modules that agents can navigate easily: small explicit interfaces, clear ownership, and cohesive implementations. Keep each feature's implementation, types, and public-interface behavior tests together.
- Keep the CMS core independent of frontend frameworks and HTTP routing. Keep HTTP contexts and SQL-driver types inside their adapters.
- Browser code communicates with the server through HTTP and browser-safe shared contracts. It must not import server implementations, database adapters, or executable collection configuration.
- Cross-module callers use public entry points. Keep implementation files private; prevent cross-module deep imports and dependency cycles.
- For backend operations, pass dependencies explicitly and represent expected failures with discriminated results. Construct runtime resources at application startup and follow the established pattern for each concern.
- As module boundaries are introduced, enforce dependency direction and public entry points with package exports, types, or automated import checks in CI.
- Validate external configuration and document input at entry points. Keep internal operations typed.
- Keep field validation rules distinct from editor presentation settings. Changing an editor must preserve the field's data contract.
- Enforce database-dependent guarantees, such as uniqueness, at the persistence layer.

## Command recipes

- Use `vp run <script>` for repository package-script commands in instructions, documentation, examples, and agent execution. Do not use `bun run <script>` for these recipes.
- Keep Bun where it is the configured runtime inside a script; this rule does not require rewriting package-script implementations.

## Local infrastructure

- Start local services through committed configuration and repository commands. Add infrastructure changes to the repository before using them; do not create ad hoc containers.
- Use `vp run db:test -- <command>` for disposable Postgres. It isolates concurrent runs and cleans up their storage. Never reset another worktree's database.

## Code policy

- Do not add ordinary code comments, including inline, line, or block comments. Use clear names and structure to explain the code.
- Declaration documentation such as JSDoc is allowed. Do not reformat ordinary comments as docstrings to bypass this rule.
- Never use compiler suppression directives, including `@ts-expect-error`, `@ts-ignore`, or `@ts-nocheck`, even inside docstrings.
- Verify expected type errors with isolated negative fixtures and explicit compiler diagnostics, without suppressions.
- Run `vp run check:policy` for JavaScript and TypeScript changes. The configured type-check command also enforces this policy.

## Agent collaboration

- Select models by capability from those available in the active harness. Do not hardcode provider names, model names, or versions in shared instructions.
- Use the most capable reasoning model available for complex analysis, scoping, architecture, and review.
- Use a capable everyday coding model one tier below the strongest reasoning model for implementation. Do not use small or lightweight models for implementation; report when a suitable model is unavailable.
- Keep shared instructions in `AGENTS.md` and skills in `.agents/skills/`. Keep `CLAUDE.md` and `.claude/skills/` entries as symlinks to those sources so harnesses share the same guidance.

## Changes and verification

- Before editing, identify the active worktree, approved behavior, bounded outcome, and relevant checks. Resolve blocking behavior choices before writing dependent code or expectations; choose routine implementation details autonomously.
- Keep one authoritative specification and decision record, with one writer per shared update. Worktrees must reference them rather than maintain copies. Resolve code paths in the active worktree.
- Reuse existing tools and checks. Add verification infrastructure only when an agreed requirement cannot be checked with what exists. Before writing any infrastructure, check the version-matched documentation of repository tools and well-known libraries. Infrastructure includes test harnesses and runners, server lifecycle, clients, parsers, validators, retry loops, and report formats. Write custom code only for a gap that no stock option covers, and name that gap with a documentation link in the PR body.
- Define observable behavior and relevant failure cases before implementing a feature.
- For executable behavior changes, write or update tests first and confirm they fail for the intended reason before implementing the change.
- Derive expected results from requirements and test through the module's public interface.
- Keep changes focused and follow existing repository conventions.
- Use the repository's configured build, type-check, and test commands. Report which checks ran and any unresolved failures.
- Do not weaken assertions or skip failing checks to make an implementation pass.
- Fix the class, not only the instance. When you fix a defect or a review finding, add or extend the check that would have caught it, following `.agents/skills/guardrails/SKILL.md`, and show it failing on a planted violation.
- Before you change behavior that an earlier commit chose deliberately, read its history. Keep its intent or ask the user.
- State the reason for every exemption, such as a lint override, knip ignore, policy allowance or type cast, in the allowance's reason string, or else in the commit and PR body that add it.
- Verify documentation and configuration changes directly; add executable tests when behavior changes.
- Run only the checks necessary to verify the current change and its affected callers. Select the smallest relevant test files, cases, and package checks. Explain what each selected check proves before running it.
- Do not run repository-wide suites or aggregate commands containing unrelated tests unless the user explicitly requests them. This includes `vp run check`, `vp run test`, `vp run test:all`, and `vp run test:prepared`. Completing, committing, or merging a task does not require a full-suite run.
- Broaden verification only when a failure or a concrete dependency impact requires it. Name the affected behavior and select its relevant checks. UI work does not require backend, database, mutation, or verification-tool suites unless it changes those concerns.
- For documentation-only changes, inspect the edited text, links, and diff. Do not run executable test suites.
- Reuse passing evidence for unchanged code, dependencies, configuration, and environment. Repeat a check only when its inputs change, it fails, or a new finding requires it. Record the command, exit code, and revision or content hash; setup failures do not establish behavior.
- Use one focused audit of the completed change. Follow up on named findings and affected code instead of restarting a broad review. The author checks the reviewer's evidence and log; do not create recursive audit chains.
- `.github/workflows/ci.yml` runs the required `Lint, typecheck and test` check. Each `vp run` step runs one package script; rerun that script locally to reproduce a failure.
- `.github/workflows/pr-evidence.yml` runs the advisory `UI evidence` check on PRs that change shipped web UI. [Automation instructions](.github/AGENTS.md) define what it accepts.

## Public documentation

- Keep README.md focused on general development setup and getting started. Do not add implementation progress, module plans, or internal design notes.
- Routine README.md development-setup updates that reflect agreed tooling or workflow changes are authorized. Keep installation and development commands current as part of those changes.
- Obtain explicit user approval for other public documentation changes. A direct request for a specific documentation change authorizes that change; feature work alone does not.

## Public writing

Apply these rules to README.md, guides, reference docs, and other public copy.

- Use plain words, active voice, short complete sentences, and consistent terms.
- Describe concrete behavior and instructions. Support claims with evidence or named sources; distinguish planned features from shipped behavior.
- Cut hype, filler, jargon, metaphors, chatbot phrases, vague claims, and needless hedging. Avoid stock contrasts such as "not just X, but Y" and forced lists of three.
- Use sentence case headings and straight quotes. Avoid em dashes, decorative emoji, excessive bold, and fragments that make readers decode the text.
