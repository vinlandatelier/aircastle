import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "vite-plus/test";

test("the production Bun runtime validates the independent Unicode corpus", () => {
  const result = spawnSync(
    "bun",
    [fileURLToPath(new URL("../support/bun-runtime.ts", import.meta.url))],
    {
      encoding: "utf8",
      timeout: 10_000,
    },
  );
  expect(result.error).toBeUndefined();
  expect({ status: result.status, stderr: result.stderr, stdout: result.stdout }).toEqual({
    status: 0,
    stderr: "",
    stdout: "Validated 1187 Unicode fixtures under Bun\n",
  });
});
