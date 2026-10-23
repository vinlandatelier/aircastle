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

## Local Postgres

Install Docker with Compose v2.20 or later and start the Docker engine. The committed `compose.yaml` pins Postgres 18.6 by image digest. It supports ARM64 and AMD64.

```sh
cp .env.example .env
bun run db:up
```

Postgres listens on `127.0.0.1:43123`. The example contains local-only credentials and a `DATABASE_URL` for application development. The API does not connect to the database yet.

`db:up` waits for readiness. `bun run db:down` removes the container but preserves its data. `bun run db:logs` follows database logs. **`bun run db:reset` deletes this Compose project's database data.** Run `db:up` again to create an empty database.

Compose names resources after the checkout directory. For concurrent worktrees, use distinct directory names and set a different `AIRCASTLE_DB_PORT` in each `.env`; update its `DATABASE_URL` port to match. Do not share a `COMPOSE_PROJECT_NAME` between independent checkouts.

Run a command against a disposable database:

```sh
bun run db:test -- bun run test-api
```

The wrapper uses the same Compose file and pinned image. Each invocation gets a unique project, volume and automatically assigned localhost port. It supplies `DATABASE_URL` to the command, overriding any inherited value. It preserves the command's exit status and deletes its database after success, failure, Ctrl-C or termination. Forced kills and Docker outages can prevent cleanup; the wrapper prints its project name for recovery with `docker compose -p <project> -f compose.yaml down --volumes`.

`bun run test:db` verifies the infrastructure with real Postgres, including persistence, reset and concurrent isolation. It requires Docker and runs separately from the regular test suite. Future CI database checks should use `db:test` so the image pin stays in one place.
