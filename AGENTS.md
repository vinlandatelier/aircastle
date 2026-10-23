# Aircastle agent instructions

Aircastle is a standalone headless CMS with code-defined collections. These instructions apply throughout the repository.

## Architecture

- Design deep modules that agents can navigate easily: small explicit interfaces, clear ownership, cohesive implementations, and nearby tests showing observable behavior.
- Keep the CMS core independent of frontend frameworks and HTTP routing.
- Validate external configuration and document input at entry points. Keep internal operations typed.
- Keep field validation rules distinct from editor presentation settings. Changing an editor must preserve the field's data contract.
- Enforce database-dependent guarantees, such as uniqueness, at the persistence layer.

## Code policy

- Do not add ordinary code comments, including inline, line, or block comments. Use clear names and structure to explain the code.
- Declaration documentation such as JSDoc is allowed. Do not reformat ordinary comments as docstrings to bypass this rule.
- Never use compiler suppression directives, including `@ts-expect-error`, `@ts-ignore`, or `@ts-nocheck`, even inside docstrings.
- Verify expected type errors with isolated negative fixtures and explicit compiler diagnostics, without suppressions.
- Run `bun run check:policy` for JavaScript and TypeScript changes. The configured type-check command also enforces this policy.

## Changes and verification

- Define observable behavior and relevant failure cases before implementing a feature.
- For executable behavior changes, write or update tests first and confirm they fail for the intended reason before implementing the change.
- Derive expected results from requirements and test through the module's public interface.
- Keep changes focused and follow existing repository conventions.
- Use the repository's configured build, type-check, and test commands. Report which checks ran and any unresolved failures.
- Do not weaken assertions or skip failing checks to make an implementation pass.
- Verify documentation and configuration changes directly; add executable tests when behavior changes.

## Public documentation

- Keep README.md focused on general development setup and getting started. Do not add implementation progress, module plans, or internal design notes.
- Obtain explicit user approval before changing README.md or any other public documentation. A direct request for a specific documentation change authorizes that change; feature work alone does not.
