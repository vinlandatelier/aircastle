import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "vite-plus/test";

test("native Bun transport sends an uncertain create once even after a pooled read", () => {
  const script = fileURLToPath(new URL("./test-support/native-transport.ts", import.meta.url));
  const output = execFileSync("bun", ["--conditions=development", script], {
    encoding: "utf8",
    timeout: 15_000,
  });
  const result = JSON.parse(output);
  expect(result.healthy).toEqual({
    attempts: 1,
    result: { ok: false, error: { code: "unknown_write_outcome" } },
  });
  expect(result.faulted.attempts).toBeGreaterThan(1);
  expect(result.faulted.failed).toBe(true);
});
