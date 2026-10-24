import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const repository = fileURLToPath(new URL("../../", import.meta.url));

export function execute(
  file: string,
  args: string[],
  options: { cwd?: string; env?: Record<string, string | undefined> } = {},
) {
  return new Promise<{ code: number; output: string }>((resolve) => {
    execFile(
      file,
      file === "bun" ? ["--conditions=development", ...args] : args,
      {
        cwd: options.cwd ?? repository,
        env: { ...process.env, ...options.env },
        timeout: processDeadlines.command,
      },
      (error, stdout, stderr) =>
        resolve({
          code: error ? (typeof error.code === "number" ? error.code : 1) : 0,
          output: stdout + stderr,
        }),
    );
  });
}

export async function developerApp() {
  const cwd = await mkdtemp(join(tmpdir(), "aircastle-developer-app-"));
  const client = pathToFileURL(join(repository, "packages/client/src/index.ts")).href;
  await mkdir(join(cwd, "node_modules/@aircastle"), { recursive: true });
  await symlink(
    join(repository, "packages/schema"),
    join(cwd, "node_modules/@aircastle/schema"),
    "dir",
  );
  await writeFile(
    join(cwd, "aircastle.config.ts"),
    `import { defineConfig } from ${JSON.stringify(client)};
import { collection, text } from "@aircastle/schema";
export default defineConfig({ url: process.env.AIRCASTLE_URL, project: process.env.AIRCASTLE_PROJECT_ID, collections: {
articles: collection({ title: text().min(1), slug: text().unique(), summary: text().optional(), status: text().oneOf(["draft", "published"]).default("draft") })
} });`,
  );
  return { cwd, cleanup: () => rm(cwd, { recursive: true, force: true }) };
}

export const processDeadlines = {
  start: 20_000,
  stop: 10_000,
  kill: 5_000,
  command: 25_000,
};

async function within<T>(promise: Promise<T>, milliseconds: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function reservePort() {
  const reservation = createServer();
  await new Promise<void>((resolve, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", resolve);
  });
  try {
    const address = reservation.address();
    if (!address || typeof address === "string") throw new Error("Expected a loopback port");
    return address.port;
  } finally {
    await new Promise<void>((resolve, reject) => {
      reservation.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

export async function standaloneServer(
  namespace: string,
  env: Record<string, string | undefined> = {},
) {
  const port = await reservePort();
  const url = `http://127.0.0.1:${port}`;
  const child = spawn("bun", ["apps/api/dist/index.js"], {
    cwd: repository,
    env: {
      ...process.env,
      AIRCASTLE_MAX_REQUEST_BYTES: "1048576",
      ...env,
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      AIRCASTLE_DATABASE_NAMESPACE: namespace,
      PORT: String(port),
      NODE_ENV: "production",
      LOG_LEVEL: "silent",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const capture = (chunk: Buffer) => {
    output = (output + chunk.toString()).slice(-65_536);
  };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  const exited = new Promise<{ code: number | null; signal: string | null }>((resolve) => {
    child.once("error", (error) => {
      output += `\n${error.stack ?? error.message}`;
      resolve({ code: null, signal: null });
    });
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  const diagnostics = () =>
    `Built API pid=${child.pid} url=${url} namespace=${namespace}: ${output}`;
  const stop = async (graceful: boolean) => {
    child.kill("SIGTERM");
    let result = await within(exited, processDeadlines.stop);
    if (result === undefined) {
      child.kill("SIGKILL");
      result = await within(exited, processDeadlines.kill);
      throw new Error(
        `Built API exceeded shutdown deadline; exit=${JSON.stringify(result)}. ${diagnostics()}`,
      );
    }
    if (graceful && (result.code !== 0 || result.signal !== null)) {
      throw new Error(`Built API shutdown failed: ${JSON.stringify(result)}. ${diagnostics()}`);
    }
  };
  try {
    const deadline = Date.now() + processDeadlines.start;
    let lastHealthError: unknown;
    while (true) {
      const result = await within(exited, 0);
      if (result !== undefined) {
        throw new Error(
          `Built API exited before readiness: ${JSON.stringify(result)}. ${diagnostics()}`,
        );
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new Error(
          `Built API readiness deadline exceeded: ${String(lastHealthError)}. ${diagnostics()}`,
        );
      }
      try {
        const health = await fetch(`${url}/api/health`, {
          signal: AbortSignal.timeout(Math.min(1_000, remaining)),
        });
        const body: unknown = await health.json();
        if (health.status !== 200 || JSON.stringify(body) !== '{"status":"ok"}') {
          throw new Error(`Health returned ${health.status}: ${JSON.stringify(body)}`);
        }
        break;
      } catch (error) {
        lastHealthError = error;
      }
      await within(exited, 50);
    }
  } catch (error) {
    try {
      await stop(false);
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Built API startup and cleanup failed");
    }
    throw error;
  }
  let closing: Promise<void> | undefined;
  return {
    url,
    close: () => (closing ??= stop(true)),
  };
}
