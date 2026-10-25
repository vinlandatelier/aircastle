import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkSchema, matches, isJsonObject } from "./schema.ts";

export { isJsonObject };

export type Role = "reviewer" | "implementer";
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export type ModelSelection = { model: string; effort: Effort };
export type ModelConfig = { version: 1; roles: Record<Role, ModelSelection> };

const roles: Role[] = ["reviewer", "implementer"];

export function isRole(value: unknown): value is Role {
  return roles.some((role) => role === value);
}
const efforts: Record<Effort, true> = {
  low: true,
  medium: true,
  high: true,
  xhigh: true,
  max: true,
};
const maxOutputBytes = 64 * 1_048_576;
const runTimeoutMs = 25 * 60_000;
const detailChars = 300;
/** Structured output takes two turns, the answer and its acceptance. The rest allow schema retries. */
const maxTurns = 4;

function effort(value: unknown): value is Effort {
  return typeof value === "string" && Object.hasOwn(efforts, value);
}

export function isModelSelection(value: unknown): value is ModelSelection {
  return (
    isJsonObject(value) &&
    Object.keys(value).sort().join() === "effort,model" &&
    typeof value.model === "string" &&
    /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value.model) &&
    effort(value.effort)
  );
}

function selection(value: unknown): ModelSelection {
  if (!isModelSelection(value)) throw new Error("invalid_model_config");
  return { model: value.model, effort: value.effort };
}

export function parseModelConfig(value: unknown): ModelConfig {
  if (
    !isJsonObject(value) ||
    Object.keys(value).sort().join() !== "roles,version" ||
    value.version !== 1 ||
    !isJsonObject(value.roles) ||
    Object.keys(value.roles).sort().join() !== [...roles].sort().join()
  )
    throw new Error("invalid_model_config");
  return {
    version: 1,
    roles: {
      reviewer: selection(value.roles.reviewer),
      implementer: selection(value.roles.implementer),
    },
  };
}

type Run = { code: number | null; signal: string | null; stdout: string; stderr: string };

function claude(args: string[], prompt: string, directory: string, token: string): Promise<Run> {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", args, {
      cwd: directory,
      env: {
        PATH: process.env.PATH ?? "",
        HOME: directory,
        CLAUDE_CONFIG_DIR: join(directory, ".claude"),
        CLAUDE_CODE_OAUTH_TOKEN: token,
      },
      stdio: ["pipe", "pipe", "pipe"],
      timeout: runTimeoutMs,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let size = 0;
    let failure: Error | null = null;
    const collect = (chunks: Buffer[]) => (chunk: Buffer) => {
      size += chunk.byteLength;
      if (size > maxOutputBytes) {
        failure = new Error("provider_output_limit");
        child.kill();
      } else chunks.push(chunk);
    };
    child.stdout.on("data", collect(stdout));
    child.stderr.on("data", collect(stderr));
    child.on("error", (error) => {
      failure ??= new Error("provider_unavailable", { cause: error });
    });
    child.on("close", (code, signal) => {
      if (failure) reject(failure);
      else
        resolve({
          code,
          signal,
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
        });
    });
    child.stdin.on("error", () => undefined);
    child.stdin.end(prompt);
  });
}

/**
 * Makes CLI text safe for logs: no token, no control characters, bounded length. Redaction runs on
 * the whole text before truncation, and a truncated tail drops its cut first word.
 */
function sanitize(text: string, token: string, keep: "head" | "tail"): string {
  const clean = text
    .replaceAll(token, "[redacted]")
    .replace(/sk-ant-[\w-]+/g, "[redacted]")
    .replace(/[^\x20-\x7e]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
  if (clean.length <= detailChars) return clean;
  return keep === "head"
    ? clean.slice(0, detailChars)
    : clean.slice(-detailChars).replace(/^\S*\s*/, "");
}

/**
 * Names a provider failure with a stable code and the CLI's own reason, so an expired token or a
 * plan rate limit reads differently from a model failure.
 */
function providerError(
  code: string,
  run: Run,
  token: string,
  data: Record<string, unknown> = {},
): Error {
  const details = [
    run.code === null ? `signal=${run.signal ?? "unknown"}` : `exit=${run.code}`,
    ...(["subtype", "terminal_reason", "result"] as const).flatMap((key) => {
      const value = data[key];
      return typeof value === "string" && value
        ? [`${key}=${JSON.stringify(sanitize(value, token, "head"))}`]
        : [];
    }),
    ...(run.stderr.trim() ? [`stderr=${JSON.stringify(sanitize(run.stderr, token, "tail"))}`] : []),
  ];
  return new Error(`${code}: ${details.join(" ")}`);
}

function accept(
  run: Run,
  token: string,
  chosen: ModelSelection,
  schema: Record<string, unknown>,
  data: unknown,
): { response: Record<string, unknown>; value: unknown } {
  if (run.code === null) throw providerError("provider_timeout", run, token);
  if (data === undefined) throw providerError("provider_invalid_json", run, token);
  if (!isJsonObject(data) || data.type !== "result")
    throw providerError("provider_invalid_response", run, token);
  if (run.code !== 0 || data.is_error !== false || data.subtype !== "success")
    throw providerError(
      data.subtype === "error_max_turns" ? "provider_incomplete" : "provider_failed",
      run,
      token,
      data,
    );
  if (!Object.hasOwn(data, "structured_output"))
    throw providerError("provider_no_structured_output", run, token, data);
  if (!matches(schema, data.structured_output))
    throw providerError("provider_schema_mismatch", run, token);
  if (!isJsonObject(data.modelUsage) || !Object.hasOwn(data.modelUsage, chosen.model))
    throw providerError("provider_model_mismatch", run, token);
  return { response: data, value: data.structured_output };
}

async function writeReceipt(record: Record<string, unknown>, token: string): Promise<void> {
  const directory = process.env.AI_MODEL_RECEIPTS_DIR;
  if (!directory) return;
  const receipt = JSON.stringify({ version: 1, ...record }).replaceAll(token, "[redacted]");
  const hash = createHash("sha256").update(receipt).digest("hex");
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, `${hash}.json`), receipt, { flag: "wx" });
  } catch {
    throw new Error("provider_receipt_unavailable");
  }
}

/**
 * Runs one prompt through the Claude Code CLI on the subscription in `CLAUDE_CODE_OAUTH_TOKEN`.
 * The CLI runs in an empty directory with a fresh configuration, no tools and no MCP servers, and
 * receives only the environment it needs, so no API key in the caller's environment reaches it.
 */
export async function runModel(
  input: ModelSelection,
  prompt: string,
  schema: Record<string, unknown>,
): Promise<unknown> {
  const chosen = selection(input);
  checkSchema(schema);
  if (
    schema.type !== "object" ||
    Buffer.byteLength(prompt) > 200_000 ||
    Buffer.byteLength(JSON.stringify(schema)) > 32_000
  )
    throw new Error("invalid_model_input");
  const token = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  if (!token) throw new Error("setup_required");
  const args = [
    "-p",
    "--output-format",
    "json",
    "--json-schema",
    JSON.stringify(schema),
    "--model",
    chosen.model,
    "--effort",
    chosen.effort,
    "--tools",
    "",
    "--strict-mcp-config",
    "--no-session-persistence",
    "--max-turns",
    String(maxTurns),
  ];
  const started = Date.now();
  const directory = await mkdtemp(join(tmpdir(), "ai-model-"));
  let run: Run;
  try {
    run = await claude(args, prompt, directory, token);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  let data: unknown;
  try {
    data = JSON.parse(run.stdout);
  } catch {
    data = undefined;
  }
  const request = { args, prompt };
  let accepted: { response: Record<string, unknown>; value: unknown };
  try {
    accepted = accept(run, token, chosen, schema, data);
  } catch (error) {
    await writeReceipt(
      {
        request,
        response: data ?? null,
        stderr: sanitize(run.stderr, token, "tail"),
        failure: error instanceof Error ? error.message : "provider_failed",
      },
      token,
    ).catch((receiptError: unknown) => {
      console.error(
        JSON.stringify({
          kind: "model_receipt_failure",
          error: receiptError instanceof Error ? receiptError.message : "provider_receipt_failed",
        }),
      );
    });
    throw error;
  }
  const { response, value } = accepted;
  const execution = {
    selection: chosen,
    models: isJsonObject(response.modelUsage) ? Object.keys(response.modelUsage) : [],
    effort: "sent",
    turns: typeof response.num_turns === "number" ? response.num_turns : null,
    durationMs: Date.now() - started,
    usage: isJsonObject(response.usage)
      ? Object.fromEntries(
          Object.entries(response.usage).filter(
            (entry) => typeof entry[1] === "number" && Number.isFinite(entry[1]) && entry[1] >= 0,
          ),
        )
      : null,
    sessionId:
      typeof response.session_id === "string"
        ? response.session_id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 128)
        : "",
  };
  console.log(JSON.stringify({ kind: "model_execution", ...execution }));
  await writeReceipt({ request, response, execution }, token);
  return value;
}
