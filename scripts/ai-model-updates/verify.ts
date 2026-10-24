import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { coding } from "./fixtures.ts";
import { digest, proposeModelUpdate, type Prepared, type Verification } from "./index.ts";

function assertSecretless(): void {
  if (
    [
      "OPENAI_API_KEY",
      "ANTHROPIC_API_KEY",
      "GITHUB_TOKEN",
      "GH_TOKEN",
      "GH_APP_PRIVATE_KEY",
      "AI_APP_PRIVATE_KEY",
      "AI_MODEL_READ_TOKEN",
    ].some((key) => process.env[key])
  )
    throw new Error("credential_boundary_violation");
}

async function executeInContainer(source: string, inputs: unknown[]): Promise<unknown[] | null> {
  const image = process.env.AI_MODEL_EVALUATOR_IMAGE;
  if (!image || !/^sha256:[a-f0-9]{64}$/.test(image)) throw new Error("evaluator_setup_required");
  const name = `aircastle-model-eval-${randomUUID()}`;
  try {
    return await new Promise<unknown[] | null>((resolve, reject) => {
      const child = spawn(
        "docker",
        [
          "run",
          "--rm",
          "--name",
          name,
          "--network",
          "none",
          "--read-only",
          "--cap-drop",
          "ALL",
          "--security-opt",
          "no-new-privileges",
          "--pids-limit",
          "16",
          "--memory",
          "128m",
          "--cpus",
          "1",
          "--user",
          "65534:65534",
          "-i",
          image,
        ],
        {
          env: { PATH: process.env.PATH ?? "/usr/bin:/bin" },
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
      }, 5000);
      let text = "";
      child.stdout.on("data", (chunk: Buffer) => {
        text += chunk.toString("utf8");
        if (text.length > 65_536) child.kill("SIGKILL");
      });
      child.stderr.resume();
      child.stdin.on("error", () => {});
      child.on("error", () => {
        clearTimeout(timer);
        reject(new Error("evaluator_unavailable"));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if ([125, 126, 127].includes(code ?? 125))
          return reject(new Error("evaluator_unavailable"));
        if (code !== 0 || text.length > 65_536) return resolve(null);
        try {
          const result: unknown = JSON.parse(text);
          resolve(Array.isArray(result) ? result : null);
        } catch {
          resolve(null);
        }
      });
      child.stdin.end(JSON.stringify({ source, inputs }));
    });
  } finally {
    await new Promise<void>((resolve) => {
      const cleanup = spawn("docker", ["rm", "--force", name], {
        env: { PATH: process.env.PATH ?? "/usr/bin:/bin" },
        stdio: "ignore",
      });
      const timer = setTimeout(() => cleanup.kill("SIGKILL"), 3000);
      cleanup.on("error", () => {
        clearTimeout(timer);
        resolve();
      });
      cleanup.on("close", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}

export async function verifyModelUpdate(
  prepared: Prepared,
  execute = executeInContainer,
): Promise<Verification> {
  assertSecretless();
  const codeRuns = prepared.runs.filter((run) => run.role.endsWith("Implementer"));
  const verification: Verification = {
    preparedHash: digest(prepared),
    results: codeRuns.map((run) => ({ id: run.id, outputs: null })),
  };
  proposeModelUpdate(prepared, verification);
  for (const run of codeRuns) {
    const source =
      typeof run.output === "object" && run.output !== null && "source" in run.output
        ? run.output.source
        : null;
    if (
      typeof source !== "string" ||
      source.length > 12_000 ||
      Object.keys(run.output as object).join() !== "source"
    )
      continue;
    const fixture = coding.find((item) => item.id === run.fixture)!;
    const outputs = await execute(
      source,
      fixture.checks.map((check) => check.input),
    );
    verification.results.find((item) => item.id === run.id)!.outputs = outputs;
  }
  return verification;
}

export async function checkEvaluatorImage(): Promise<void> {
  assertSecretless();
  const capabilities = await executeInContainer(
    "() => [typeof process, typeof require, typeof fetch]",
    [null],
  );
  const escape = await executeInContainer(
    "() => globalThis.constructor.constructor('return process')().env",
    [null],
  );
  const loop = await executeInContainer("() => { while (true) {} }", [null]);
  if (
    JSON.stringify(capabilities) !== '[["undefined","undefined","undefined"]]' ||
    escape !== null ||
    loop !== null
  )
    throw new Error("evaluator_probe_failed");
}
