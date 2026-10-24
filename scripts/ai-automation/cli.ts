import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  Coordinator,
  digest,
  fixSchema,
  integer,
  prompt,
  record,
  reviewSchema,
  renderPatch,
  sha,
  text,
  validateEdits,
  validateReview,
  type Job,
  type ModelOutput,
  type Verification,
} from "./index.ts";
import { verificationPlan, verify } from "./verify.ts";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`setup_required: ${name} is missing`);
  return value;
}
function coordinator(): Coordinator {
  if (
    required("GITHUB_REF") !== "refs/heads/main" ||
    !required("GITHUB_WORKFLOW_REF").endsWith("@refs/heads/main")
  )
    throw new Error("setup_required: trusted default-branch workflow required");
  return new Coordinator({
    repository: required("GITHUB_REPOSITORY"),
    token: required("AI_GITHUB_TOKEN"),
    botId: integer(Number(required("AI_BOT_USER_ID"))),
    botLogin: `${required("AI_APP_SLUG")}[bot]`,
    stateIssue: integer(Number(required("AI_STATE_ISSUE"))),
    activatedAt: required("AI_ACTIVATED_AT"),
    control: sha(required("AI_CONTROL_SHA")),
    run: required("GITHUB_RUN_ID"),
  });
}
async function json(path: string, max = 2_000_000): Promise<unknown> {
  const raw = await readFile(path);
  if (raw.length > max) throw new Error("Input artifact exceeds bound");
  return JSON.parse(raw.toString("utf8"));
}
async function output(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value));
}
function inputJob(value: unknown): Job {
  const job = record(value),
    snapshot = record(job.snapshot),
    selection = record(job.selection);
  if (
    job.version !== 1 ||
    !/^[a-f0-9]{64}$/.test(String(job.id)) ||
    !["review", "fix"].includes(String(job.task)) ||
    !["codexReviewer", "codexImplementer", "claudeReviewer", "claudeImplementer"].includes(
      String(job.role),
    )
  )
    throw new Error("Invalid job");
  sha(job.control);
  sha(snapshot.head);
  sha(snapshot.base);
  integer(snapshot.number);
  text(selection.model, 200);
  text(selection.effort, 40);
  if (
    !Array.isArray(snapshot.files) ||
    !Array.isArray(snapshot.changedPaths) ||
    !Array.isArray(snapshot.omitted)
  )
    throw new Error("Invalid context bundle");
  return job as unknown as Job;
}
async function main(): Promise<void> {
  const command = process.argv[2];
  const root = resolve(import.meta.dirname, "../..");
  const target = process.env.AI_DATA_DIR ?? "ai-data";
  if (command === "setup") {
    required("AI_GITHUB_TOKEN");
    required("OPENAI_API_KEY");
    required("ANTHROPIC_API_KEY");
    const api = coordinator();
    await api.setup();
    const { parseModelConfig, runModel } = await import("../ai-models/index.ts");
    const config = parseModelConfig(await json(resolve(root, ".github/ai-models.json")));
    for (const role of [
      "codexReviewer",
      "codexImplementer",
      "claudeReviewer",
      "claudeImplementer",
    ] as const) {
      const result = record(
        await runModel(config.roles[role], 'Return {"ready":true} using the requested schema.', {
          type: "object",
          properties: { ready: { type: "boolean" } },
          required: ["ready"],
          additionalProperties: false,
        }),
      );
      if (result.ready !== true)
        throw new Error(`setup_required: live compatibility probe failed for ${role}`);
      console.log(
        JSON.stringify({
          role,
          selection: config.roles[role],
          compatibility: "live API/schema accepted",
          evaluation: "not evaluated",
        }),
      );
    }
    console.log(
      "Live transport/schema setup passed. Representative model quality evaluation and verification-container isolation still require separate evidence.",
    );
    return;
  }
  if (command === "prepare") {
    const api = coordinator();
    await api.setup();
    const { parseModelConfig } = await import("../ai-models/index.ts");
    const config = parseModelConfig(await json(resolve(root, ".github/ai-models.json")));
    let immediate: number | undefined;
    if (process.env.GITHUB_EVENT_NAME === "issue_comment") {
      const event = record(await json(required("GITHUB_EVENT_PATH")));
      if (event.action === "created" && record(event.issue).pull_request)
        immediate = integer(record(event.comment).id);
    }
    const jobs = await api.prepare(config, immediate);
    await mkdir(`${target}/plan`, { recursive: true });
    for (const job of jobs) await output(`${target}/plan/${job.id}.json`, job);
    const matrix = {
      include: jobs.map((job) => ({
        id: job.id,
        provider: job.selection.provider,
        task: job.task,
      })),
    };
    await appendFile(
      required("GITHUB_OUTPUT"),
      `matrix=${JSON.stringify(matrix)}\nhas_jobs=${jobs.length > 0}\n`,
    );
    console.log(`Prepared ${jobs.length} authorized independent operations.`);
    return;
  }
  if (!["model", "verify", "publish"].includes(command ?? ""))
    throw new Error("Usage: node scripts/ai-automation/cli.ts setup|prepare|model|verify|publish");
  const id = required("AI_OPERATION_ID");
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("Invalid operation ID");
  const job = inputJob(await json(`${target}/plan/${id}.json`));
  if (job.id !== id || job.control !== required("AI_CONTROL_SHA"))
    throw new Error("Control revision mismatch");
  if (command === "model") {
    const { parseModelConfig, runModel } = await import("../ai-models/index.ts");
    const config = parseModelConfig(await json(resolve(root, ".github/ai-models.json")));
    if (digest(config.roles[job.role]) !== digest(job.selection))
      throw new Error("Trusted model configuration mismatch");
    required(job.selection.provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY");
    console.log(
      JSON.stringify({ operation: id, head: job.snapshot.head, selection: job.selection }),
    );
    const result = await runModel(
      job.selection,
      prompt(job),
      job.task === "fix" ? fixSchema : reviewSchema,
    );
    const valid =
      job.task === "fix"
        ? validateEdits(result, job.snapshot)
        : validateReview(result, job.snapshot);
    if (job.task === "fix") {
      await mkdir(`${target}/model`, { recursive: true });
      await writeFile(
        `${target}/model/${id}.patch`,
        renderPatch(validateEdits(valid, job.snapshot), job.snapshot),
      );
    }
    await output(`${target}/model/${id}.json`, {
      id,
      digest: digest(job),
      result: valid,
      selection: job.selection,
    });
    return;
  }
  const modelPath = `${target}/model/${id}.json`;
  if (command === "verify") {
    if (job.task !== "fix") {
      await output(`${target}/verification/${id}.json`, { id, skipped: "review-only" });
      return;
    }
    const model = record(await json(modelPath)) as unknown as ModelOutput;
    const receipt = await verify(job, model, required("GITHUB_REPOSITORY"));
    await output(`${target}/verification/${id}.json`, receipt);
    if (receipt.commands !== null && !receipt.passed)
      throw new Error("Secretless verification failed; no fix branch authorized");
    return;
  }
  const api = coordinator();
  const receipts = await api.receipts(job.snapshot.number);
  const claim = receipts.find((r) => r.receipt.id === id);
  if (
    !claim ||
    claim.receipt.digest !== digest(job) ||
    claim.receipt.run !== required("GITHUB_RUN_ID")
  )
    throw new Error("Original bot-authenticated claim mismatch");
  if (claim.receipt.state === "published" || claim.receipt.state === "stale") return;
  if (!(await api.current(job))) {
    await api.finish(claim, "stale");
    return;
  }
  const fresh = await api.snapshot(job.snapshot.number, claim.receipt.job.snapshot);
  const original = { ...claim.receipt.job, snapshot: fresh };
  if (digest(original) !== claim.receipt.digest)
    throw new Error("Publisher immutable context revalidation failed");
  let model: ModelOutput;
  try {
    model = record(await json(modelPath)) as unknown as ModelOutput;
  } catch {
    await api.finish(claim, "failed");
    throw new Error("Model output unavailable; no successful review or fix was produced");
  }
  if (
    model.id !== id ||
    model.digest !== digest(original) ||
    digest(model.selection) !== digest(original.selection)
  )
    throw new Error("Model result input binding mismatch");
  if (job.task === "review") console.log(await api.publishReview(original, model.result, claim));
  else {
    const receipt = record(
      await json(`${target}/verification/${id}.json`),
    ) as unknown as Verification;
    const commands = verificationPlan(validateEdits(model.result, original.snapshot).edits);
    if (
      required("AI_VERIFICATION_JOB_RESULT") !== "success" ||
      receipt.recipe !== digest(commands) ||
      digest(receipt.commands) !== digest(commands) ||
      (commands === null && receipt.passed !== false)
    ) {
      await api.finish(claim, "failed");
      throw new Error("Verification supervisor job did not succeed");
    }
    console.log(await api.publishFix(original, model.result, receipt, claim));
  }
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "AI automation failed");
  process.exitCode = 1;
});
