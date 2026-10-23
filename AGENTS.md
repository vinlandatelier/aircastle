# Aircastle agent instructions

Aircastle is a standalone headless CMS with code-defined collections. These instructions apply throughout the repository.

## Architecture

- Design deep modules that agents can navigate easily: small explicit interfaces, clear ownership, and cohesive implementations. Keep each feature's implementation, types, and public-interface behavior tests together.
- Keep the CMS core independent of frontend frameworks and HTTP routing. Keep HTTP contexts and SQL-driver types inside their adapters.
- Browser code communicates with the server through HTTP and browser-safe shared contracts. It must not import server implementations, database adapters, or executable collection configuration.
- Cross-module callers use public entry points. Keep implementation files private; prevent cross-module deep imports and dependency cycles.
- For backend operations, pass dependencies explicitly and represent expected failures with discriminated results. Construct runtime resources at application startup and follow the established pattern for each concern.
- As module boundaries are introduced, enforce dependency direction and public entry points with package exports, types, or automated import checks in CI.
- Validate external configuration and document input at entry points. Keep internal operations typed.
- Keep field validation rules distinct from editor presentation settings. Changing an editor must preserve the field's data contract.
- Enforce database-dependent guarantees, such as uniqueness, at the persistence layer.

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
- Routine README.md development-setup updates that reflect agreed tooling or workflow changes are authorized. Keep installation and development commands current as part of those changes.
- Obtain explicit user approval for other public documentation changes. A direct request for a specific documentation change authorizes that change; feature work alone does not.
