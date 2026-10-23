# Aircastle

Aircastle is a code-first, headless CMS with agentic capabilities designed to automate the slow, manual parts of managing written content.

## Development

Install the [Vite+ CLI](https://viteplus.dev/guide/) and use Node.js 24.11 or later within the 24.x release line. Other supported Node.js versions are listed in `engines.node` in `package.json`.

Vite+ uses Bun 1.3.4 for dependency management, pinned in `.bun-version` and `package.json`.

```sh
vp install --frozen-lockfile
vp run -r typecheck
vp check
vp run test:types
vp run -r build
vp run -r --parallel dev
```

This starts the web app on port 5173 and the Bun API on port 3000. The API exposes `GET /health` for process liveness.

To run one app, use `vp dev` for the web app or `vp run @aircastle/server#dev` for the API. Run the server tests with `vp run @aircastle/server#test`.
