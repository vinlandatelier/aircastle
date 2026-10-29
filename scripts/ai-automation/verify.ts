import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { digest, validateEdits, type Job, type ModelOutput, type Verification } from "./index.ts";

import { verificationPlan } from "./checks.ts";
import { boundModelOutput } from "./operations.ts";

async function toolchainVersions(): Promise<Record<string, string>> {
  const root = new URL("../../", import.meta.url);
  const read = async (file: string) => (await readFile(new URL(file, root), "utf8")).trim();
  const manifest = JSON.parse(await read("package.json"));
  return {
    NODE_VERSION: await read(".node-version"),
    BUN_VERSION: await read(".bun-version"),
    VITE_PLUS_VERSION: String(manifest.catalog["vite-plus"]),
  };
}
export async function verify(
  job: Job,
  output: ModelOutput,
  repository: string,
): Promise<Verification> {
  const model = boundModelOutput(job, output);
  if (model.task !== "fix") throw new Error("Verification requires a fix result");
  const fix = validateEdits(model.result, job.snapshot);
  const commands = verificationPlan(fix.edits);
  const receipt: Verification = {
    id: job.id,
    digest: digest(job),
    editsDigest: digest(fix.edits),
    passed: false,
    commands,
    recipe: digest(commands),
    scope:
      commands === null
        ? "Patch only: scoped verification unavailable for these edited paths. No verification commands ran."
        : "Secretless scoped commands listed in this receipt. PR scripts/configuration remain untrusted; no broader checks are claimed.",
  };
  if (commands === null) return receipt;
  const root = await mkdtemp(join(tmpdir(), "aircastle-ai-verify-"));
  const name = `aircastle-ai-${job.id.slice(0, 20)}-${process.pid}`;
  try {
    await writeFile(join(root, "job.json"), JSON.stringify(job));
    await writeFile(join(root, "result.json"), JSON.stringify(output));
    await chmod(root, 0o755);
    const dockerfile = await readFile(new URL("./Dockerfile", import.meta.url), "utf8");
    if (!dockerfile.includes("@sha256:")) throw new Error("Verification image must be pinned");
    const run = (args: string[], timeout: number): number => {
      const result = spawnSync("docker", args, {
        stdio: "inherit",
        env: { PATH: process.env.PATH, HOME: process.env.HOME },
        timeout,
        killSignal: "SIGKILL",
      });
      if (result.error && "code" in result.error && result.error.code === "ETIMEDOUT") return 124;
      if (result.error) throw result.error;
      return result.status ?? 1;
    };
    const toolchain = await toolchainVersions();
    const image = `aircastle-ai-verifier:${digest([dockerfile, toolchain]).slice(0, 16)}`;
    if (
      run(
        [
          "build",
          ...Object.entries(toolchain).flatMap(([name, value]) => [
            "--build-arg",
            `${name}=${value}`,
          ]),
          "--tag",
          image,
          "--file",
          new URL("./Dockerfile", import.meta.url).pathname,
          new URL(".", import.meta.url).pathname,
        ],
        300000,
      ) !== 0
    )
      return receipt;
    receipt.passed =
      run(
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
      ) === 0;
    run(["rm", "--force", name], 10000);
    return receipt;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
