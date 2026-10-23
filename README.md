# Aircastle

Aircastle is a code-first, headless CMS with agentic capabilities designed to automate the slow, manual parts of managing written content.

## Development

Install the [Vite+ CLI](https://viteplus.dev/guide/) and use Node.js 24.11 or later within the 24.x release line. Other supported Node.js versions are listed in `engines.node` in `package.json`.

Vite+ uses Bun 1.3.4 for dependency management, pinned in `.bun-version` and `package.json`.

```sh
vp install --frozen-lockfile
vp check
vp run -r build
vp dev
```
