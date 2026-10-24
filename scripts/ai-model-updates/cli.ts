import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseModelConfig, runModel } from "../ai-models/index.ts";
import {
  digest,
  fixtureHash,
  prepareModelUpdate,
  type Prepared,
  type Verification,
} from "./index.ts";
import { publishModelUpdate } from "./publisher.ts";
import { checkEvaluatorImage, verifyModelUpdate } from "./verify.ts";
import { checkDailyWindow } from "./daily.ts";

const configFile = new URL("../../.github/ai-models.json", import.meta.url);
const schema = {
  type: "object",
  properties: { ok: { type: "boolean", const: true } },
  required: ["ok"],
  additionalProperties: false,
};

async function readJson(path: string | URL): Promise<unknown> {
  const text = await readFile(path, "utf8");
  if (Buffer.byteLength(text) > 4_000_000) throw new Error("artifact_limit");
  return JSON.parse(text);
}
async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
}
async function manifest(directory: string): Promise<void> {
  const files: { path: string; sha256: string }[] = [];
  for (const item of await readdir(directory, { recursive: true, withFileTypes: true })) {
    if (!item.isFile()) continue;
    const file = join(item.parentPath, item.name);
    const contents = await readFile(file);
    files.push({
      path: file.slice(directory.length + 1),
      sha256: createHash("sha256").update(contents).digest("hex"),
    });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  await writeJson(join(directory, "manifest.json"), { version: 1, files });
}

async function main(): Promise<void> {
  const [command, output, preparedPath] = process.argv.slice(2);
  const config = parseModelConfig(await readJson(configFile));
  if (command === "offline") {
    console.log(
      JSON.stringify({
        status: "offline_ok",
        live: "unverified",
        configHash: digest(config),
        fixtureHash: fixtureHash(),
      }),
    );
    return;
  }
  if (command === "live") {
    if (!process.env.OPENAI_API_KEY || !process.env.ANTHROPIC_API_KEY)
      throw new Error("setup_required");
    for (const [role, selection] of Object.entries(config.roles)) {
      await runModel(
        selection,
        'Compatibility check. Return {"ok":true} using the supplied schema.',
        schema,
      );
      console.log(JSON.stringify({ role, selection, status: "live_compatible" }));
    }
    return;
  }
  if (command === "sandbox") {
    await checkEvaluatorImage();
    console.log(JSON.stringify({ status: "evaluator_ok" }));
    return;
  }
  if (!output) throw new Error("invalid_arguments");
  if (command === "prepare") {
    if (
      process.env.GITHUB_REF !== "refs/heads/main" ||
      (process.env.GITHUB_EVENT_NAME !== "schedule" &&
        process.env.GITHUB_EVENT_NAME !== "workflow_dispatch")
    )
      throw new Error("untrusted_workflow_ref");
    if (!process.env.OPENAI_API_KEY || !process.env.ANTHROPIC_API_KEY)
      throw new Error("setup_required");
    await checkDailyWindow({
      repository: process.env.GITHUB_REPOSITORY ?? "",
      runId: process.env.GITHUB_RUN_ID ?? "",
      attempt: process.env.GITHUB_RUN_ATTEMPT ?? "",
      token: process.env.AI_MODEL_READ_TOKEN ?? "",
      date: new Date().toISOString().slice(0, 10),
    });
    const directory = resolve(output);
    await mkdir(directory, { recursive: false });
    process.env.AI_MODEL_RECEIPTS_DIR = join(directory, "raw");
    try {
      const prepared = await prepareModelUpdate(config, process.env.GITHUB_SHA ?? "");
      await writeJson(join(directory, "prepared.json"), prepared);
    } finally {
      await manifest(directory);
    }
    return;
  }
  if (command === "verify") {
    if (!preparedPath) throw new Error("invalid_arguments");
    const prepared = (await readJson(preparedPath)) as Prepared;
    const verification = await verifyModelUpdate(prepared);
    await mkdir(resolve(output), { recursive: false });
    await writeJson(join(resolve(output), "verification.json"), verification);
    await manifest(resolve(output));
    return;
  }
  if (command === "publish") {
    if (!preparedPath) throw new Error("invalid_arguments");
    if (
      process.env.GITHUB_REF !== "refs/heads/main" ||
      (process.env.GITHUB_EVENT_NAME !== "schedule" &&
        process.env.GITHUB_EVENT_NAME !== "workflow_dispatch")
    )
      throw new Error("untrusted_workflow_ref");
    const prepared = (await readJson(output)) as Prepared;
    const verification = (await readJson(preparedPath)) as Verification;
    const result = await publishModelUpdate(prepared, verification, {
      repository: process.env.GITHUB_REPOSITORY ?? "",
      botLogin: process.env.AI_MODEL_BOT_LOGIN ?? "",
      token: process.env.GH_TOKEN ?? "",
      runUrl: `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
    });
    console.log(JSON.stringify(result));
    return;
  }
  throw new Error("invalid_arguments");
}

try {
  await main();
} catch (error) {
  const code =
    error instanceof Error && /^[a-z_]+(?:_\d{3})?$/.test(error.message)
      ? error.message
      : "model_update_unavailable";
  console.error(JSON.stringify({ status: code, config: "unchanged" }));
  process.exitCode = 1;
}
