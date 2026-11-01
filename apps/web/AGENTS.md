# Web UI

Follow [ARCHITECTURE.md](../../ARCHITECTURE.md#web-app-structure) for the web app's file structure, module ownership, and public entry points.

## Verification

Follow [VERIFICATION.md](VERIFICATION.md) before implementing behavior. It defines test placement, observable expectations, red evidence, and completion evidence.

- Run `vp run test-web` for fast component behavior, `vp run test-web:e2e` for built-browser journeys, and `vp run test-web:coverage` for V8 HTML/JSON reports over all frontend source.
- The [README](../../README.md#development) covers the Chromium install, `WEB_E2E_PORT` for concurrent worktrees, and report locations.
- Follow the root [verification rules](../../AGENTS.md#changes-and-verification). `vp run check` is not a required completion gate.
- Focus component and browser runs by file and case, for example `vp run test-web src/features/sign-in/index.test.tsx` or `vp run test-web:e2e metadata.spec.ts`. Add scenario filters such as `--grep long-text` where appropriate. Check changed UI in a browser without running unrelated journeys.
- `vp run test-web:record <specs>` runs the same journeys and saves a `video.webm` and a final screenshot for every test under `reports/test-results/`. Recording slows each action by 500 ms, labels each action and step in the video, and raises the test timeout to 120 s. Normal runs record no video and keep full speed.
- A PR that changes what a user sees or does needs recorded evidence in its body. Follow [Complete the feature](VERIFICATION.md#complete-the-feature).
- Read `coverage/index.html` and `coverage/coverage-summary.json` together. Raw coverage includes shared UI wrappers and compiler-generated branches, excludes CSS, and has no percentage gate.
- Lint rejects child processes, server launchers, and `test.skip` or `test.fixme` in browser tooling. Add servers to `webServer` and checks to package scripts instead of writing a runner.

## UI conventions

- Use semantic colour tokens in shared UI components. `src/index.css` owns the light/dark `marketing` and `dashboard` palettes; declare `data-theme-scope` on page layouts, with marketing as the public-page default. Keep palette choices out of individual buttons, inputs, and overlays.
- Add directories when working code needs them. Do not keep empty scaffolding or placeholder folders.
- Use icon libraries instead of handwritten or copied SVG paths. Prefer `lucide-react` for UI icons and `@primer/octicons-react` for GitHub icons. Keep custom product branding in `public/brand`.
- Every enabled clickable control must show a pointer cursor on hover. Use native interactive elements or the correct accessible role so the shared rule in `src/index.css` applies.
- Preserve text-entry cursors on editable inputs and disabled cursors on disabled controls. Maintain the shared rule instead of adding cursor styles to individual components.
- The header shows `public/brand/logo-light.png` and `public/brand/logo-dark.png`, and the favicons embed 64px copies of the same files. After changing either logo during development, run `vp run --filter @aircastle/web generate:icons` to refresh the favicons. The development and build commands also generate them. App-wide favicon theme handling belongs in `App.tsx` so public pages follow the same preference.
