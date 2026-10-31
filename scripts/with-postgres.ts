import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const command = process.argv.slice(2);
if (command[0] === "--") command.shift();
if (!command.length) {
  console.error("Usage: bun run db:test -- <command> [arguments]");
  process.exit(2);
}

const root = fileURLToPath(new URL("../", import.meta.url));
const project = `aircastle-test-${randomUUID()}`;
const env = {
  ...process.env,
  COMPOSE_PROJECT_NAME: project,
  AIRCASTLE_DB_PORT: "0",
  AIRCASTLE_DB_NAME: "aircastle",
  AIRCASTLE_DB_USER: "aircastle",
  AIRCASTLE_DB_PASSWORD: "aircastle-local",
};
const compose = ["compose", "--project-name", project, "-f", `${root}compose.yaml`];
let active: ReturnType<typeof Bun.spawn> | undefined;
let interrupted = 0;

async function run(args: string[], childEnv: NodeJS.ProcessEnv = env): Promise<number> {
  const child = Bun.spawn(args, {
    cwd: root,
    env: childEnv,
    stdio: ["inherit", "inherit", "inherit"],
    detached: true,
  });
  active = child;
  try {
    return await child.exited;
  } finally {
    active = undefined;
  }
}

for (const [signal, status] of [
  ["SIGINT", 130],
  ["SIGTERM", 143],
] as const) {
  process.on(signal, () => {
    interrupted = status;
    if (active?.pid) {
      const pid = active.pid;
      try {
        process.kill(-pid, signal);
      } catch {
        return;
      }
      const timer = setTimeout(() => {
        try {
          process.kill(-pid, "SIGKILL");
        } catch {
          return;
        }
      }, 5_000);
      timer.unref();
      void active.exited.finally(() => clearTimeout(timer));
    }
  });
}

try {
  console.error(`Disposable Postgres project: ${project}`);
  const started = await run([
    "docker",
    ...compose,
    "up",
    "-d",
    "--wait",
    "--wait-timeout",
    "90",
    "postgres",
  ]);
  if (started !== 0 || interrupted) throw new Error("Postgres startup did not complete");
  const port = spawnSync("docker", [...compose, "port", "postgres", "5432"], {
    cwd: root,
    env,
    encoding: "utf8",
  });
  const address = port.stdout?.trim();
  if (port.status !== 0 || !/^127\.0\.0\.1:\d+$/.test(address))
    throw new Error("Cannot resolve Postgres port");
  const AIRCASTLE_DATABASE_URL = `postgresql://aircastle:aircastle-local@${address}/aircastle`;
  process.exitCode = await run(command, { ...env, AIRCASTLE_DATABASE_URL });
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  const cleanup = spawnSync("docker", [...compose, "down", "--volumes", "--remove-orphans"], {
    cwd: root,
    env,
    stdio: "inherit",
    timeout: 60_000,
  });
  if (cleanup.status !== 0) {
    console.error(
      `Cleanup failed. Retry: docker compose -p ${project} -f compose.yaml down --volumes`,
    );
    process.exitCode = 1;
  }
  if (interrupted) process.exitCode = interrupted;
}
