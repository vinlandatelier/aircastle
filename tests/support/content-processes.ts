import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
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
      { cwd: options.cwd ?? repository, env: { ...process.env, ...options.env }, timeout: 25_000 },
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

export async function standaloneServer(namespace: string) {
  let resolveExit: (code: number) => void = () => {};
  const exited = new Promise<number>((resolve) => {
    resolveExit = resolve;
  });
  const child = execFile(
    "bun",
    ["--conditions=development", "apps/api/src/test-support/content-server.ts"],
    {
      cwd: repository,
      env: { ...process.env, AIRCASTLE_DATABASE_NAMESPACE: namespace },
      maxBuffer: 1_048_576,
    },
    (error) => {
      resolveExit(error ? (typeof error.code === "number" ? error.code : 1) : 0);
    },
  );
  let output = "";
  const url = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Standalone server did not start: ${output}`));
    }, 20_000);
    void exited.then((code) => {
      clearTimeout(timeout);
      reject(new Error(`Standalone server exited ${code}: ${output}`));
    });
    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      const found = output.match(/AIRCASTLE_TEST_URL=(http:\/\/[^\s]+)/)?.[1];
      if (found) {
        clearTimeout(timeout);
        resolve(found);
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
  });
  return {
    url,
    close: async () => {
      if (child.exitCode !== null) return;
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          child.kill("SIGKILL");
          reject(new Error(`Standalone server did not stop: ${output}`));
        }, 10_000);
        void exited.then(() => {
          clearTimeout(timeout);
          resolve();
        });
        child.kill("SIGTERM");
      });
    },
  };
}
