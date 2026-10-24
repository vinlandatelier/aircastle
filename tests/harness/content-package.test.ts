import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "vite-plus/test";

test("public built SDK entry loads as JavaScript in an ordinary Node application", () => {
  const script = `const entry = import.meta.resolve('@aircastle/client'); if (!entry.endsWith('.mjs') && !entry.endsWith('.js')) throw new Error('Expected a built JavaScript package entry'); const sdk = await import('@aircastle/client'); console.log(JSON.stringify({ createClient: typeof sdk.createClient, defineConfig: typeof sdk.defineConfig }));`;
  const result = spawnSync("node", ["--input-type=module", "-e", script], {
    cwd: resolve("."),
    env: { ...process.env, NODE_OPTIONS: undefined },
    encoding: "utf8",
    timeout: 15_000,
  });
  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({ createClient: "function", defineConfig: "function" });
}, 20_000);

test("declared aircastle executable can be launched by the operating system", () => {
  const cwd = mkdtempSync(join(tmpdir(), "aircastle-empty-project-"));
  try {
    const metadata: { bin: { aircastle: string } } = JSON.parse(
      readFileSync(resolve("packages/cli/package.json"), "utf8"),
    );
    const result = spawnSync(resolve("packages/cli", metadata.bin.aircastle), ["push"], {
      cwd,
      env: { ...process.env, AIRCASTLE_API_KEY: undefined },
      encoding: "utf8",
      timeout: 15_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stdout + result.stderr).toBe(1);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}, 20_000);

test("developer configuration fixtures use the public schema builder identity", () => {
  const schemaEntry = import.meta.resolve("@aircastle/schema");
  const script = `import { collection, text } from ${JSON.stringify(schemaEntry)}; import { compileSchema } from "@aircastle/schema"; const compiled = compileSchema({ articles: collection({ title: text() }) }); console.log(JSON.stringify(compiled.articles.validate({ title: "Hello" })));`;
  const result = spawnSync("bun", ["--conditions=development", "-e", script], {
    cwd: resolve("."),
    encoding: "utf8",
    timeout: 15_000,
  });
  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({ ok: true, data: { title: "Hello" } });
}, 20_000);
