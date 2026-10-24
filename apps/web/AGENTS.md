# Web UI

## File structure

- `src/App.tsx`, `src/main.tsx`, and `src/router.tsx` compose the app, providers, and routes.
- `src/components/shell/` owns the persistent header, sidebar, page frame, and private supporting controls. Import it through its `index.tsx` entry point.
- `src/components/ui/` holds shared UI primitives.
- `src/features/<feature>/` owns a product feature's behavior, types, data fetching, and tests. Import features through their `index.ts` or `index.tsx` entry point; keep supporting files private.
- Keep feature-specific hooks and helpers inside their feature. Reserve `src/hooks/` and `src/lib/` for shared browser subscriptions and utilities.
- Keep public-interface behavior tests beside the module implementation. Add feature folders only when implementing their behavior.

## UI conventions

- Add directories when working code needs them. Do not keep empty scaffolding or placeholder folders.
- Use icon libraries instead of handwritten or copied SVG paths. Prefer `lucide-react` for UI icons and `@primer/octicons-react` for GitHub icons. Keep custom product branding in `public/brand`.
- Every enabled clickable control must show a pointer cursor on hover. Use native interactive elements or the correct accessible role so the shared rule in `src/index.css` applies.
- Preserve text-entry cursors on editable inputs and disabled cursors on disabled controls. Maintain the shared rule instead of adding cursor styles to individual components.
- After changing `public/brand/logo.png` or `--brand-foreground` during development, run `vp run --filter @aircastle/web generate:icons` to refresh the favicons. The development and build commands also generate them.
