---
name: guardrails
description: Index of the rules Aircastle enforces and where, plus the steps for turning a defect or review finding into a check. Use before working around a failing check, when fixing a defect or review finding, or when adding a lint rule, policy rule, harness test or CI step.
---

# Guardrails

A fix without a check fixes one instance. The next agent copies the old idiom. When you fix a defect or a review finding, add or extend the check that would have caught it.

## Pick the highest layer

Put each rule at the highest layer that can express it.

1. Types and structure. Make the bad state impossible to write, for example a private constructor, a discriminated union, or one exported helper instead of copies.
2. Lint. The `lint` block in `vite.config.ts`, run by `vp run lint`.
3. Policy script and harness tests. `scripts/check-code-policy.ts` (`vp run check:policy`) and `tests/harness/*.test.ts`.
4. A CI step in `.github/workflows/ci.yml`.
5. Prose in `AGENTS.md`. Use it only when nothing above can express the rule, and keep it to one line.

## What main enforces

`vp run typecheck` runs `check:policy` first. CI runs the harness tests through `vp run test:prepared`. Run one harness file with `vp test tests/harness/<file>`.

| Rule | Enforced in | See it fail |
| --- | --- | --- |
| Lint correctness errors fail, and so do warnings | `vite.config.ts` `lint.categories.correctness: "error"`; the `lint` script is `vp lint --deny-warnings` | `[3, 1].sort()` in a source file, then `vp run lint` |
| No `any`, no `@ts-` comments, no namespaces | `vite.config.ts` rules `typescript/no-explicit-any`, `typescript/ban-ts-comment`, `typescript/no-namespace` | `vp run lint` |
| Exhaustive switches, only `Error` objects thrown | `typescript/switch-exhaustiveness-check`; `typescript/only-throw-error`, which allows only TanStack Router's `Redirect` | A switch missing a union member, or `throw "bad"`, then `vp run lint` |
| Interface members are properties, not methods | `typescript/method-signature-style` | `read(): void` in an interface, then `vp run lint` |
| No unused files, exports or dependencies | `knip.json`; CI step "Find unused code" | An unused export, then `vp run knip` |
| No import cycles | `import/no-cycle` in lint; `workspace-cycle` in `check-code-policy.ts` for package manifests | Two packages that depend on each other, then `vp run check:policy` |
| Browser-safe code imports only `@aircastle/contracts`, `schema` and `client` entry points, no Node built-ins, no `bun`, `postgres` or `pino` | `vite.config.ts` override for `apps/web/src`, `packages/{contracts,schema,client}/src` with `import/no-nodejs-modules` and a `no-restricted-imports` allowlist | `import "@aircastle/core"` in `packages/contracts/src`, then `vp run lint` |
| Packages import each other by declared name only | `cross-workspace-relative-import` and `undeclared-workspace-import` in `check-code-policy.ts` | `../../schema/src/index.ts` from `packages/core/src`, then `vp run check:policy` |
| Web `@/` imports stay inside `apps/web/src` | `web-alias-escape` in `check-code-policy.ts` | `@/../vite.config.ts` in `apps/web/src`, then `vp run check:policy` |
| Feature and web shell files are private outside their module | `tests/harness/module-boundaries.test.ts` | A relative import of another feature's file, then `vp test tests/harness/module-boundaries.test.ts` |
| Source reads env only in `apps/api/src/config.ts` | `vite.config.ts` override for `apps/*/src`, `packages/*/src`: `node/no-process-env`, `Bun.env` in `no-restricted-properties`, `env` from `node:process` or `process` in `no-restricted-imports`. `packages/cli/src/index.ts` may read only `AIRCASTLE_API_KEY` | `Bun.env.X` in `packages/core/src`, then `vp run lint` |
| No raw SQL through `.unsafe` | `no-restricted-properties` with the `rawSql` entry. Exempt: `packages/adapter-postgres/src/identifier.ts` and `src/test-support/database.ts` | `sql.unsafe(...)` or `const { unsafe } = sql`, then `vp run lint` |
| No ordinary comments, no type suppressions | `ordinary-comment` and `type-suppression` in `check-code-policy.ts` | `// note` in any TS file, then `vp run check:policy` |
| Errors are not swallowed | `swallowed-error` in `check-code-policy.ts` for catch clauses and inline `.catch`/`.then` handlers in `apps/*/src` and `packages/*/src`. `deliberateCatchAllowances` lists the exact count per file with a reason; `stale-catch-allowance` fails when the count no longer matches. Lint adds `no-empty` and `preserve-caught-error` | `catch {}` in `packages/core/src`, then `vp run check:policy` |
| Package exports list TypeScript source first under `development` | `tests/harness/package-exports.test.ts` | Remove the `development` condition, then `vp test tests/harness/package-exports.test.ts` |
| Every `vp run` recipe names a real script, docs never use `bun run` | `tests/harness/command-recipes.test.ts` (skips `.agents/skills` and `.claude/skills`) | `vp run no-such-script` in a doc, then `vp test tests/harness/command-recipes.test.ts` |
| `CLAUDE.md` and `.claude/skills/*` are symlinks to `AGENTS.md` and `.agents/skills/*` | `tests/harness/agent-instructions.test.ts` | A skill directory without its link, then `vp test tests/harness/agent-instructions.test.ts` |
| Bun version comes from `.bun-version` | `tests/harness/bun-version.test.ts` (`packageManager`, `@types/bun` catalog, no `engines.bun`); `.github/actions/setup/action.yml` compares `bun --version` | A different version in `packageManager`, then `vp test tests/harness/bun-version.test.ts` |
| TypeScript comes from the catalog, and every tsconfig sets `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` | `tests/harness/typescript-config.test.ts` | Drop one flag from a tsconfig, then `vp test tests/harness/typescript-config.test.ts` |
| Schema line, branch, function and statement coverage | `thresholds` in `packages/schema/vite.config.ts`; CI step "Test schema coverage" | `vp run test:coverage` after deleting a test |
| Schema and contracts mutation score of at least 94 | `thresholds.break` in `packages/{schema,contracts}/stryker.config.json`; nightly `.github/workflows/mutation.yml`, not on pull requests | `vp -C packages/schema run test:mutation` |
| Logged errors carry no message or cause | `packages/core/src/error-summary.ts`: `ErrorSummary` has a private constructor, `ReportError` accepts only an `ErrorSummary`, and the API sets `c.error = ErrorSummary.of(error)`. `apps/api/src/app.test.ts` checks a secret never reaches the log | Pass a raw error to `report`, then `vp run typecheck` |
| The fake store and the Postgres store behave alike | `contentStoreContract` in `packages/core/src/test-support/store-contract.ts`, run by `packages/core/src/store-contract.test.ts` and `packages/adapter-postgres/src/store-contract.test.ts` | `vp -C packages/core test src/store-contract.test.ts`; the Postgres run needs `vp run db:test -- vp -C packages/adapter-postgres test src/store-contract.test.ts` |
| Workflow files are valid | actionlint in the CI step "Lint workflows" | CI only |

If a check blocks you, fix the code. Change the check only when it is wrong, and say why in the PR.

## Add a guardrail

1. Write the check at the highest layer that works. Prefer a stock rule (oxlint, knip, the compiler) over new code in the policy script.
2. Plant a violation, run the check, and record the command and exit code. Remove the plant before you commit.
3. Try to get past the check the way a hurried agent would: an alias, destructuring, a computed or template key, an alternate global such as `Bun.env`, a dynamic `import()`, or a broad exemption glob. Close each bypass you find and plant it again.
4. Keep exemptions narrow and give the reason where you declare them. A policy allowance carries a reason string. A lint override names exact files, and its commit gives the reason, because `vite.config.ts` can't hold ordinary comments. A lint override replaces the rule's whole option list, so repeat the entries it must keep, as the env overrides do with `rawSql`.
5. Name the guardrail and the planted-violation result in the PR body.

## Review rules

These came out of review. Each has its reason and what enforces it.

- Prefer stock tools over bespoke infrastructure. Home-built checkers need fixes of their own; the web verification tooling took five and once passed with a fake runner. The raw SQL ban moved from the policy script to oxlint in 627358b. Review only.
- One helper per meaning. Five files had a helper called `record`, some returning a boolean and some throwing, so callers couldn't tell which they had (971be5f). Review only.
- No public unchecked escape hatches. Agents take the shortest path, so an exported unchecked variant becomes the default. Use private constructors and narrow factories, as `ErrorSummary.of` does. Enforced by types where you build them that way, otherwise review only.
- Validate at the boundary instead of casting. A cast hides a wrong shape until runtime. Review only; `no-unsafe-type-assertion` is not on yet.
- Derive each fact from one source. Copies of versions, regexes and validation rules drift. Enforced for Bun and TypeScript versions by the harness tests above, otherwise review only.
- Keep deliberate earlier decisions unless the user agrees. Read `git log` for the lines you change first. A first error-logging fix undid the sanitized logging from 6dbd1d0. Review only.
- Tests assert public behavior and exact issues, not private attributes or loose subsets. Such tests pass while the behavior breaks. Mutation runs check this for schema and contracts, otherwise review only.
- Set thresholds and scores only from runs you reproduced. The first mutation threshold came from a run where machine load raised the score (9a5d669). Review only.
