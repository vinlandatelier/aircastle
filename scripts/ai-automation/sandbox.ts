import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { applyEdits, record, sha, validateEdits, type Job } from "./index.ts";

function run(command: string, args: string[], cwd: string, timeout = 300000): void {
  const result = spawnSync(command, args, {
    cwd,
    env: { PATH: process.env.PATH, HOME: "/tmp", CI: "true" },
    stdio: "inherit",
    timeout,
  });
  if (result.status !== 0)
    throw new Error(`Verification command failed: ${command}; status ${result.status}`);
}
const job = record(JSON.parse(await readFile("/input/job.json", "utf8"))) as unknown as Job;
const output = record(JSON.parse(await readFile("/input/result.json", "utf8")));
const fix = validateEdits(output.result, job.snapshot);
const repository = process.env.AI_REPOSITORY;
if (!repository || !/^vinlandatelier\/[\w.-]+$/.test(repository))
  throw new Error("Invalid source repository");
run("git", ["init", "/tmp/source"], "/tmp");
run(
  "git",
  [
    "-c",
    "core.hooksPath=/dev/null",
    "fetch",
    "--depth=1",
    `https://github.com/${repository}.git`,
    sha(job.snapshot.head),
  ],
  "/tmp/source",
);
run("git", ["-c", "core.hooksPath=/dev/null", "checkout", "--detach", "FETCH_HEAD"], "/tmp/source");
await applyEdits("/tmp/source", fix.edits);
run("bun", ["install", "--frozen-lockfile", "--ignore-scripts"], "/tmp/source");
run("vp", ["run", "build"], "/tmp/source");
run("vp", ["run", "typecheck"], "/tmp/source");
run("vp", ["run", "lint"], "/tmp/source");
run("vp", ["run", "test-schema"], "/tmp/source");
