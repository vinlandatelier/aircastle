import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, test } from "vite-plus/test";

const apiDirectory = resolve(import.meta.dirname, "..");
const cli = resolve(apiDirectory, "node_modules/.bin/hono");
const cliTimeout = 10_000;
const testTimeout = cliTimeout + 5_000;

describe("Hono CLI", () => {
  test(
    "discovers API routes without starting the server",
    () => {
      const result = spawnSync(process.execPath, [cli, "routes", "src/cli.ts"], {
        cwd: apiDirectory,
        encoding: "utf8",
        timeout: cliTimeout,
      });

      expect(result.status, result.stderr).toBe(0);
      const output = JSON.parse(result.stdout);

      expect(output.ok).toBe(true);
      expect(output.data.routes).toContainEqual(
        expect.objectContaining({ method: "GET", path: "/api/health" }),
      );
    },
    testTimeout,
  );

  test(
    "sends a request through the Bun runtime without starting the server",
    () => {
      const result = spawnSync(
        process.execPath,
        [cli, "request", "/api/health", "src/cli.ts", "--runtime", "bun"],
        { cwd: apiDirectory, encoding: "utf8", timeout: cliTimeout },
      );

      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        ok: true,
        data: { status: 200, body: { status: "ok" }, runtime: "bun" },
      });
    },
    testTimeout,
  );
});
