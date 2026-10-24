import { spawn } from "node:child_process";
import { chmod, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { digest, validateEdits, type Job, type ModelOutput, type Verification } from "./index.ts";

export const verificationRecipe =
  "aircastle-ai-container-v1: bun install --frozen-lockfile --ignore-scripts; vp run build; vp run typecheck; vp run lint; vp run test-schema";
export async function verify(
  job: Job,
  output: ModelOutput,
  repository: string,
): Promise<Verification> {
  const fix = validateEdits(output.result, job.snapshot);
  if (output.digest !== digest(job) || output.id !== job.id)
    throw new Error("Verification input digest mismatch");
  const root = await mkdtemp(join(tmpdir(), "aircastle-ai-verify-"));
  const name = `aircastle-ai-${job.id.slice(0, 20)}-${process.pid}`;
  const receipt: Verification = {
    id: job.id,
    digest: digest(job),
    editsDigest: digest(fix.edits),
    passed: false,
    recipe: digest(verificationRecipe),
    scope:
      "Secretless container dependency install, build, typecheck, lint, schema tests. PR package scripts/configuration are untrusted. Runtime, Postgres and browser tests remain the required deterministic CI's responsibility.",
  };
  try {
    await writeFile(join(root, "job.json"), JSON.stringify(job));
    await writeFile(join(root, "result.json"), JSON.stringify(output));
    await chmod(root, 0o755);
    const dockerfile = await readFile(new URL("./Dockerfile", import.meta.url), "utf8");
    if (!dockerfile.includes("@sha256:")) throw new Error("Verification image must be pinned");
    const run = (args: string[], timeout: number): Promise<number> =>
      new Promise((resolve, reject) => {
        const child = spawn("docker", args, {
          stdio: "inherit",
          env: { PATH: process.env.PATH, HOME: process.env.HOME },
        });
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          resolve(124);
        }, timeout);
        child.once("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.once("close", (code) => {
          clearTimeout(timer);
          resolve(code ?? 1);
        });
      });
    const image = `aircastle-ai-verifier:${digest(dockerfile).slice(0, 16)}`;
    if (
      (await run(
        [
          "build",
          "--tag",
          image,
          "--file",
          new URL("./Dockerfile", import.meta.url).pathname,
          new URL(".", import.meta.url).pathname,
        ],
        300000,
      )) !== 0
    )
      return receipt;
    receipt.passed =
      (await run(
        [
          "run",
          "--name",
          name,
          "--rm",
          "--read-only",
          "--cap-drop=ALL",
          "--security-opt=no-new-privileges",
          "--pids-limit=512",
          "--memory=6g",
          "--cpus=2",
          "--tmpfs=/tmp:rw,exec,size=8g,mode=1777",
          "--mount",
          `type=bind,source=${new URL(".", import.meta.url).pathname},target=/control,readonly`,
          "--mount",
          `type=bind,source=${root},target=/input,readonly`,
          "--env",
          `AI_REPOSITORY=${repository}`,
          image,
        ],
        1200000,
      )) === 0;
    await run(["rm", "--force", name], 10000);
    return receipt;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
