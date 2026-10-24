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

## Changes and verification

- Before editing, identify the active worktree, approved behavior, bounded outcome, and relevant checks. Resolve blocking behavior choices before writing dependent code or expectations; choose routine implementation details autonomously.
- Keep one authoritative specification and decision record, with one writer per shared update. Worktrees must reference them rather than maintain copies. Resolve code paths in the active worktree.
- Reuse existing tools and checks. Add verification infrastructure only when an agreed requirement cannot be checked with what exists.
- Define observable behavior and relevant failure cases before implementing a feature.
- For executable behavior changes, write or update tests first and confirm they fail for the intended reason before implementing the change.
- Derive expected results from requirements and test through the module's public interface.
- Keep changes focused and follow existing repository conventions.
- Use the repository's configured build, type-check, and test commands. Report which checks ran and any unresolved failures.
- Do not weaken assertions or skip failing checks to make an implementation pass.
- Verify documentation and configuration changes directly; add executable tests when behavior changes.
- After edits, run affected checks. Run `vp run check` for final verification; it covers policy, source and emitted type contracts, runtime tests, and inference. A failed stage stops the command and leaves later stages unverified.
- Reuse passing evidence for unchanged code, dependencies, configuration, and environment. Repeat a check only when its inputs change, it fails, or a new finding requires it. Record the command, exit code, and revision or content hash; setup failures do not establish behavior.
- Use one focused audit of the completed change. Follow up on named findings and affected code instead of restarting a broad review. The author checks the reviewer's evidence and log; do not create recursive audit chains.
- `.github/workflows/ci.yml` runs the required `Lint, typecheck and test` check. Each step runs one package script; to reproduce a failed step, run that script locally.

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
