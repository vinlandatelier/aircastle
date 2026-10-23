# Aircastle

Aircastle is a code-first, headless CMS with agentic capabilities designed to automate the slow, manual parts of managing written content.

## Development

Install the [Vite+ CLI](https://viteplus.dev/guide/) and use Node.js 24.11 or later within the 24.x release line. Other supported Node.js versions are listed in `engines.node` in `package.json`.

Vite+ uses Bun 1.3.4 for dependency management, pinned in `.bun-version` and `package.json`.

```sh
vp install --frozen-lockfile
vp run typecheck
vp check
vp run test
vp run build
```

Start the web app on port 43121:

```sh
vp run dev-web
```

Start the API on port 43122:

```sh
vp run dev-api
```

The API uses port 43122 in both development and built runs. Override it with `PORT`; override the web app's port with `vp run dev-web -- --port <port>`. An occupied port stops startup rather than selecting another port.

Start both apps concurrently with `vp run dev`.

Run common commands from the repository root:

| Command | Scope |
| --- | --- |
| `vp run test` | All regular runtime and type-contract tests |
| `vp run test-web` | Web tests, currently an empty suite |
| `vp run test-api` | API tests |
| `vp run test-schema` | Schema runtime tests |
| `vp run test-mutation` | Slower schema mutation tests, run separately |
| `vp run lint` | Entire repository |
| `vp run lint-web` | Web app |
| `vp run lint-api` | API app |
| `vp run lint-schema` | Schema package |
