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

Create your local environment file at the repository root:

```sh
cp .env.example .env
```

Both apps read the root `.env`; no `.env` files are needed in `apps/api` or `apps/web`. Exported shell variables take precedence. Set `AIRCASTLE_PORT` in the root file to change the API port and the web app's `/api` proxy together. Only `VITE_*` variables are exposed to browser code; keep secrets out of `VITE_*` variables. Restart the development servers after changing environment values.

Start the web app on port 43121:

```sh
vp run dev-web
```

Set up [local Postgres](#local-postgres), then start the API on port 43122:

```sh
vp run dev-api
```

The API uses port 43122 in both development and built runs. Override it with `AIRCASTLE_PORT`; override the web app's port with `vp run dev-web -- --port <port>`. An occupied port stops startup rather than selecting another port.

Open [API documentation](http://localhost:43122/api/docs) or its [OpenAPI document](http://localhost:43122/api/openapi.json). The documentation UI loads a pinned Scalar script from jsDelivr and requires internet access.

The API validates its environment variables at startup and exits if one is invalid. `AIRCASTLE_PORT` must be an integer from 1 to 65535. `AIRCASTLE_LOG_LEVEL` defaults to `info` and accepts Pino's levels, including `silent`. `NODE_ENV` remains the standard runtime/build variable; use `AIRCASTLE_ENV` for Aircastle mode.

Start both apps concurrently with `vp run dev`. The dev servers load workspace TypeScript source, so no initial `vp run build` is needed.

The example environment enables local authentication at `http://localhost:43121`. Open that address to create the first super user. Open verification emails at `/development-inbox`; no email service is needed. Accounts are created after confirming the link. Set `AIRCASTLE_URL` to match if you change the browser's loopback address or port.

To run the built application and Postgres together:

```sh
docker compose --env-file /dev/null -f compose.development.yaml up --build
```

Open `http://127.0.0.1:43121`. This Compose file enables development auth and keeps database data across container recreation. An image launched independently has local auth disabled unless `AIRCASTLE_ENV=development` and a loopback `AIRCASTLE_URL` are supplied. Production authentication is not included in this local workflow.

The web dev server and local preview forward `/api` requests to the API, so browser code can use relative URLs such as `/api/health`. To change the API port for both servers, use `AIRCASTLE_PORT=43130 vp run dev`.

Run common commands from the repository root:

| Command | Scope |
| --- | --- |
| `vp run check` | Build, types, lint, unused code, runtime and database tests, browser journeys, and database runner checks |
| `vp run test:db` | Disposable Postgres runner lifecycle checks |
| `vp run test` | Build, then run runtime, Postgres, and type-contract tests with disposable databases |
| `vp run test-web` | Fast web component tests |
| `vp run test-web:e2e` | Normal and fixture web builds, then Chromium journeys |
| `vp run test-web:coverage` | Web V8 coverage with HTML and JSON reports |
| `vp run test-api` | API tests |
| `vp run test-schema` | Schema runtime tests |
| `vp run test-mutation` | Slower schema mutation tests, run separately |
| `vp run lint` | Entire repository |
| `vp run lint-web` | Web app |
| `vp run lint-api` | API app |
| `vp run lint-schema` | Schema package |

Install the browser before running web browser verification:

```sh
vp -C apps/web exec playwright install chromium
vp run test-web:e2e
```

Playwright builds the web app twice, once with its real data and once with fixture data, and serves each build until the run ends. The normal build listens on `WEB_E2E_PORT`, which defaults to 43124, the fixture build listens on the next port, and the auth journey server listens on the port after that. An occupied port stops the run. To run browser journeys in two worktrees at once, give each run its own port, for example `WEB_E2E_PORT=43224 vp run test-web:e2e`. Auth journeys also start a real API and a disposable Postgres, so they require Docker.

Each run overwrites its reports in `apps/web/reports/`. `html/` holds the HTML report, `results.json` holds the JSON results, `test-results/` holds traces and screenshots of failed tests, and `build/normal/` and `build/fixture/` hold the two builds. Open the HTML report with `vp -C apps/web exec playwright show-report reports/html`. To record a video of every auth journey, run `vp run test-auth:record`. Each test saves `video.webm` in its folder under `test-results/`. Normal runs record no video. Run a focused scenario with `vp run test-web:e2e stress.spec.ts --grep long-text`.

## Local Postgres

Install Docker with Compose v2.20 or later and start the Docker engine. The committed `compose.yaml` pins Postgres 18.6 by image digest. It supports ARM64 and AMD64.

```sh
vp run db:up
```

Postgres listens on `127.0.0.1:43123`. The example supplies `AIRCASTLE_DB_HOST`, `AIRCASTLE_DB_PORT`, `AIRCASTLE_DB_NAME`, `AIRCASTLE_DB_USER`, and `AIRCASTLE_DB_PASSWORD`. Their defaults are `127.0.0.1`, `43123`, `aircastle`, `aircastle`, and `aircastle-local`. The API and `dev:setup` build their connection from these settings. Set `AIRCASTLE_DATABASE_URL` to override all five, including connection options such as SSL. An explicitly empty or invalid URL fails configuration rather than falling back. Both commands read the root `.env`. `AIRCASTLE_DATABASE_NAMESPACE` selects the owned SQL namespace and defaults to `aircastle`. The API refuses a namespace that belongs to another application. Compose uses the configured database name and credentials when initializing new storage; changing them does not alter an existing database. The bundled app container connects to `postgres:5432` internally, while `AIRCASTLE_DB_PORT` selects the host port.

`db:up` waits for readiness. `vp run db:down` removes the container but preserves its data. `vp run db:logs` follows database logs. **`vp run db:reset` deletes this Compose project's database data.** Run `db:up` again to create an empty database.

Compose names resources after the checkout directory. For concurrent worktrees, use distinct directory names and set a different `AIRCASTLE_DB_PORT` in each `.env`. The default connection uses that port automatically. If you override `AIRCASTLE_DATABASE_URL`, keep its port in sync yourself. Do not share a `COMPOSE_PROJECT_NAME` between independent checkouts.

Run a command against a disposable database:

```sh
vp run db:test -- vp run test-api
```

The wrapper uses the same Compose file and pinned image. Each invocation gets a unique project, volume and automatically assigned localhost port. It supplies `AIRCASTLE_DATABASE_URL` to the command, overriding any inherited value. It preserves the command's exit status and deletes its database after success, failure, Ctrl-C or termination. Forced kills and Docker outages can prevent cleanup; the wrapper prints its project name for recovery with `docker compose -p <project> -f compose.yaml down --volumes`.

The full `vp run test` and `vp run check` commands require Docker and create disposable databases automatically. `vp run check` also runs web browser journeys and requires the Chromium installation described above.

Run `vp run dev:setup` to provision local development connection settings. Reruns reuse the project and do not reveal its existing key. Use `vp run dev:setup --new-key` to issue another key.

`AIRCASTLE_MAX_REQUEST_BYTES` sets the positive integer JSON request-byte limit and defaults to 1,048,576 bytes.

`vp run test:db` verifies the infrastructure with real Postgres, including persistence, reset and concurrent isolation. It requires Docker and runs separately from the regular test suite. Future CI database checks should use `db:test` so the image pin stays in one place.
