# Web UI

Follow [ARCHITECTURE.md](../../ARCHITECTURE.md#web-app-structure) for the web app's file structure, module ownership, and public entry points.

## Verification

- Install Chromium once with `vp -C apps/web exec playwright install chromium` from the repository root.
- Run `vp run test-web` for fast component behavior, `vp run test-web:e2e` for built-browser journeys, and `vp run test-web:coverage` for V8 HTML/JSON reports over all frontend source.
- Run `vp run verify-web` for frontend policy, types, lint, boundaries, component tests, fresh builds, and browser journeys. It is an aggregate command; follow the root [verification rules](../../AGENTS.md#changes-and-verification) and run it only when asked.
- Focus browser runs by file and scenario, for example `vp run test-web:e2e stress.spec.ts --grep long-text`. Run the journeys the change affects.
- Each command prints its output directory under `apps/web/reports/`. Read `receipt.json` for setup versus behavior failures, tested source, environment, counts, and cleanup; read `requirements.json` for passed, failed, and unexercised browser requirements.
- Read phase logs and JUnit/JSON reports for the failing assertion. Browser failures retain traces and screenshots under `browser/` when the page was reached. Open a trace with `vp -C apps/web exec playwright show-trace <trace.zip>`.
- Read `coverage/index.html`, `coverage/coverage-summary.json`, and `coverage-info.json` together. Raw coverage includes shared UI wrappers and compiler-generated branches, excludes CSS, and has no percentage gate. Controlled fault checks establish selected test sensitivity, not a full mutation score.

## UI conventions

- Add directories when working code needs them. Do not keep empty scaffolding or placeholder folders.
- Use icon libraries instead of handwritten or copied SVG paths. Prefer `lucide-react` for UI icons and `@primer/octicons-react` for GitHub icons. Keep custom product branding in `public/brand`.
- Every enabled clickable control must show a pointer cursor on hover. Use native interactive elements or the correct accessible role so the shared rule in `src/index.css` applies.
- Preserve text-entry cursors on editable inputs and disabled cursors on disabled controls. Maintain the shared rule instead of adding cursor styles to individual components.
- The header shows `public/brand/logo-light.png` and `public/brand/logo-dark.png` directly. Favicons are generated from `public/brand/logo.png` and `--brand-foreground`; after changing either, run `vp run --filter @aircastle/web generate:icons`. The development and build commands also generate them. Changing the header logos does not update the favicons.
