import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "vite-plus/test";

const cli = fileURLToPath(new URL("./cli.ts", import.meta.url));
const command = (args: string[]) =>
  spawnSync("bun", [cli, ...args], {
    encoding: "utf8",
    env: { PATH: process.env.PATH },
    timeout: 5000,
  });

test("offline CLI succeeds while explicitly declaring live setup unverified", () => {
  const result = command(["offline"]);
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ status: "offline_ok", live: "unverified" });
});

test("live CLI without provider keys fails setup_required and never claims compatibility", () => {
  const result = command(["live"]);
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stderr)).toEqual({ status: "setup_required", config: "unchanged" });
  expect(result.stdout).toBe("");
});

test("preparation refuses non-default workflow refs before writing or spending", () => {
  const result = command(["prepare", "/tmp/unused-ai-model-output"]);
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stderr).status).toBe("untrusted_workflow_ref");
});
