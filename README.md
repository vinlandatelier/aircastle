# Aircastle

Aircastle is a code-first, headless CMS with agentic capabilities designed to automate the slow, manual parts of managing written content.

## Development

Install the [Vite+ CLI](https://viteplus.dev/guide/) and use Node.js 24.11 or later within the 24.x release line. Other supported Node.js versions are listed in `engines.node` in `package.json`.

Vite+ uses Bun for dependency management. The Bun version is pinned in `.bun-version` and in `packageManager` in `package.json`.

```sh
vp install --frozen-lockfile
vp run build
vp run typecheck
vp check
vp run test
```

Start the web app on port 43121:

```sh
vp run dev-web
```

Set up [local Postgres](#local-postgres), then start the API on port 43122:

```sh
vp run dev-api
```

The API uses port 43122 in both development and built runs. Override it with `PORT`; override the web app's port with `vp run dev-web -- --port <port>`. An occupied port stops startup rather than selecting another port.

Open [API documentation](http://localhost:43122/api/docs) or its [OpenAPI document](http://localhost:43122/api/openapi.json). The documentation UI loads a pinned Scalar script from jsDelivr and requires internet access.

The API validates its environment variables at startup and exits if one is invalid. `DATABASE_URL` is required and must not be empty. `PORT` must be an integer from 1 to 65535. `LOG_LEVEL` defaults to `info` and accepts Pino's levels, including `silent`.

Start both apps concurrently with `vp run dev`.

The web dev server and local preview forward `/api` requests to the API, so browser code can use relative URLs such as `/api/health`. To change the API port for both servers, use `PORT=43130 vp run dev`.

Run common commands from the repository root:

| Command | Scope |
| --- | --- |
| `vp run test` | Build, then run runtime, Postgres, and type-contract tests with disposable databases |
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
vp run db:up
```

Postgres listens on `127.0.0.1:43123`. The example contains local-only credentials and a `DATABASE_URL` for application development. The API uses `DATABASE_URL` and reads the root `.env` in development and local built runs. `AIRCASTLE_DATABASE_NAMESPACE` selects the owned SQL namespace and defaults to `aircastle`. The API refuses a namespace that belongs to another application.

`db:up` waits for readiness. `vp run db:down` removes the container but preserves its data. `vp run db:logs` follows database logs. **`vp run db:reset` deletes this Compose project's database data.** Run `db:up` again to create an empty database.

Compose names resources after the checkout directory. For concurrent worktrees, use distinct directory names and set a different `AIRCASTLE_DB_PORT` in each `.env`; update its `DATABASE_URL` port to match. Do not share a `COMPOSE_PROJECT_NAME` between independent checkouts.

Run a command against a disposable database:

```sh
vp run db:test -- vp run test-api
```

The wrapper uses the same Compose file and pinned image. Each invocation gets a unique project, volume and automatically assigned localhost port. It supplies `DATABASE_URL` to the command, overriding any inherited value. It preserves the command's exit status and deletes its database after success, failure, Ctrl-C or termination. Forced kills and Docker outages can prevent cleanup; the wrapper prints its project name for recovery with `docker compose -p <project> -f compose.yaml down --volumes`.

The full `vp run test` and `vp run check` commands require Docker and create disposable databases automatically.

Run `vp run dev:setup` to provision local development connection settings. Reruns reuse the project and do not reveal its existing key. Use `vp run dev:setup --new-key` to issue another key.

`AIRCASTLE_MAX_REQUEST_BYTES` sets the positive integer JSON request-byte limit and defaults to 1,048,576 bytes.

`vp run test:db` verifies the infrastructure with real Postgres, including persistence, reset and concurrent isolation. It requires Docker and runs separately from the regular test suite. Future CI database checks should use `db:test` so the image pin stays in one place.
