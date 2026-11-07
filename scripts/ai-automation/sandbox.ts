import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { parseJob, sha, validateEdits } from "./index.ts";
import { applyEdits } from "./materialize.ts";
import { verificationPlan } from "./checks.ts";

function run(command: string, args: string[], cwd: string, timeout = 300000): void {
  const result = spawnSync(command, args, {
    cwd,
    env: { PATH: `${cwd}/node_modules/.bin:${process.env.PATH}`, HOME: "/tmp", CI: "true" },
    stdio: "inherit",
    timeout,
  });
  if (result.status !== 0)
    throw new Error(`Verification command failed: ${command}; status ${result.status}`);
}
const job = parseJob(JSON.parse(await readFile("/input/job.json", "utf8")));
const fix = validateEdits(JSON.parse(await readFile("/input/result.json", "utf8")), job.snapshot);
const commands = verificationPlan(fix.edits);
if (commands === null) throw new Error("Scoped verification unavailable");
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
for (const [command, ...args] of commands) run(command!, args, "/tmp/source");
