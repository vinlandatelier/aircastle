# Web UI

Follow [ARCHITECTURE.md](../../ARCHITECTURE.md#web-app-structure) for the web app's file structure, module ownership, and public entry points.

## UI conventions

- Add directories when working code needs them. Do not keep empty scaffolding or placeholder folders.
- Use icon libraries instead of handwritten or copied SVG paths. Prefer `lucide-react` for UI icons and `@primer/octicons-react` for GitHub icons. Keep custom product branding in `public/brand`.
- Every enabled clickable control must show a pointer cursor on hover. Use native interactive elements or the correct accessible role so the shared rule in `src/index.css` applies.
- Preserve text-entry cursors on editable inputs and disabled cursors on disabled controls. Maintain the shared rule instead of adding cursor styles to individual components.
- The header shows `public/brand/logo-light.png` and `public/brand/logo-dark.png` directly. Favicons are generated from `public/brand/logo.png` and `--brand-foreground`; after changing either, run `vp run --filter @aircastle/web generate:icons`. The development and build commands also generate them. Changing the header logos does not update the favicons.
