# Frontend feature verification

Start here before implementing frontend behavior. [AGENTS.md](AGENTS.md) lists commands and artifacts; [ARCHITECTURE.md](../../ARCHITECTURE.md#web-app-structure) defines ownership.

## Before implementation

1. Write observable outcomes and failure cases. Use exact examples independent of the implementation: a submitted value, destination URL, rendered error, retained selection, or forbidden side effect.
2. Give suites and tests descriptive names, such as `document editing` and `saves a valid document`. Group related cases in the feature's test file. Select focused runs by file and `--grep`; no central registration or numbered labels are required. Keep formal requirement IDs in the feature specification when useful.
3. Put fast public-interface tests beside the feature. Add a browser journey when correctness depends on actual entry, CSS, browser storage/history, focus, keyboard input, or integration between features. Existing discovery includes `src/**/*.test.{ts,tsx}` and `e2e/*.spec.ts` automatically.
4. Select relevant failure cases: invalid/empty data, long and Unicode text, large lists, narrow screens, text enlargement, persistence, and loading/network errors when the feature has those states. State which cases do not apply.
5. Run the selected tests before implementation. Preserve the intended failed assertion. Missing imports, unavailable browsers, compilation failures and empty discovery do not establish behavioral red.

## Examples to follow

| Responsibility | Existing example |
| --- | --- |
| Component behavior through a public entry point | [Shell theme test](src/components/shell/index.test.tsx) |
| Navigation, browser history, keyboard and focus | [Navigation journeys](e2e/navigation.spec.ts) |
| Actual appearance and persisted browser preference | [Preference journeys](e2e/preferences.spec.ts) |
| Data extremes, scrolling and explicit geometry | [Stress journeys](e2e/stress.spec.ts) |
| A workflow crossing feature boundaries | [Integrated journeys](e2e/integration.spec.ts) |
| Fixtures excluded from production builds | [Build-isolation check](e2e/isolation.spec.ts) |
| Rejecting false success in verification tools | [Runner](e2e/runner.test.ts), [report](e2e/evidence.test.ts), and [strength](e2e/strength.test.ts) checks |

Import `test` and `expect` from `e2e/support.ts` in browser specs. Its automatic fixture fails local console/runtime errors and required resource failures and attaches browser metadata. Use roles and accessible names to operate the UI.

The existing `visit` and `assertLayout` helpers target the dashboard shell. For a public page, use `page.goto` with the configured normal-build base URL and assert that page's identity. Keep page-specific helpers close to their tests. Do not copy shell assumptions into unrelated features.

Supply deterministic data before rendering through a module-owned seam. Extend the verification build only when necessary; keep fixture data and overrides out of normal production output. Do not change rendered text or private React state to simulate feature data. API-backed workflows need their real repository-owned service setup and failure contract when implemented.

## Prove test strength

A red test must fail because the promised behavior is absent or broken. Use a focused fault check when needed to resolve a specific concern about test sensitivity: temporarily break that behavior in an isolated copy, confirm the relevant assertion fails, restore it, and confirm the control passes again. A screenshot or a failed build is insufficient evidence of test sensitivity.

The committed examples run through:

```sh
vp run test-web:strength
vp run test-web:strength --case theme
```

[e2e/strength-cases.ts](e2e/strength-cases.ts) declares four bounded faults: ignored theme selection, broken entry, a no-op sidebar toggle, and removed popup containment. Each has baseline, fault and restored controls. The command works in disposable copies and retains logs and structured outcomes under `apps/web/reports/`.

For new behavior, add a justified case when it fits this mechanism, or use an isolated feature-specific experiment. Choose the fault from the requirement, not from whichever line is easiest to change. Keep the case focused on the intended failing assertion. Do not add redundant campaigns merely to increase a count.

A surviving fault is a test gap or an equivalent change requiring explanation. Invalid anchors, setup failures and timeouts are separate outcomes and never count as kills. These selected cases establish sensitivity; they are not a full mutation score or a percentage quality gate.

## Complete the feature

- Follow the root [verification rules](../../AGENTS.md#changes-and-verification). Run only the component tests, browser journeys, and package checks needed to verify the change and affected callers. Select files and cases rather than running the whole frontend suite by default.
- Neither `vp run verify-web` nor `vp run check` is a required completion gate. Reserve full-suite runs for explicit user requests. A focused UI change does not require backend, database, mutation, or verification-tool suites.
- When changing verification scripts, reporters, fixtures or configuration, select the affected files or cases through `vp run test-web:verification -- <file>`. Do not run its unrelated fault campaigns.
- Run `vp run test-web:coverage` when assessing coverage. Inspect raw covered/total counts and uncovered modules. The component-suite V8 report includes unimported source, excludes CSS, and includes compiler-generated branch effects. Browser journey results are separate evidence.
- Preserve the command, revision/source fingerprint, executed/failed/skipped counts, intended red witness and final passing result. Use one focused independent review to challenge missing outcomes and assertions that could pass with broken behavior.

The receipt lists the cases selected for that run, including each test's file and title hierarchy, status, attempts, errors and browser metadata. Report only the coverage established by those selected cases. Do not weaken assertions, silently skip failures, or accept retries to obtain green evidence.
