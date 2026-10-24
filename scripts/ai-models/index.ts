import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { anthropicSchema, checkSchema, matches, record } from "./schema.ts";

export type Role = "codexReviewer" | "codexImplementer" | "claudeReviewer" | "claudeImplementer";
export type ModelSelection = { provider: "openai" | "anthropic"; model: string; effort: string };
export type ModelConfig = { version: 1; roles: Record<Role, ModelSelection> };

const roles: Role[] = ["codexReviewer", "codexImplementer", "claudeReviewer", "claudeImplementer"];
const efforts = {
  openai: ["low", "medium", "high", "xhigh", "max"],
  anthropic: ["low", "medium", "high", "max"],
};
const maxBytes = 1_048_576;
const maxOutputTokens = 8192;

function selection(value: unknown): ModelSelection {
  if (
    !record(value) ||
    Object.keys(value).sort().join() !== "effort,model,provider" ||
    (value.provider !== "openai" && value.provider !== "anthropic") ||
    typeof value.model !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value.model) ||
    typeof value.effort !== "string" ||
    !efforts[value.provider].includes(value.effort)
  )
    throw new Error("invalid_model_config");
  return { provider: value.provider, model: value.model, effort: value.effort };
}

export function parseModelConfig(value: unknown): ModelConfig {
  if (
    !record(value) ||
    Object.keys(value).sort().join() !== "roles,version" ||
    value.version !== 1 ||
    !record(value.roles) ||
    Object.keys(value.roles).sort().join() !== [...roles].sort().join()
  )
    throw new Error("invalid_model_config");
  const result = {} as Record<Role, ModelSelection>;
  for (const role of roles) {
    result[role] = selection(value.roles[role]);
    if (result[role].provider !== (role.startsWith("codex") ? "openai" : "anthropic"))
      throw new Error("invalid_model_config");
  }
  return { version: 1, roles: result };
}

async function readResponse(response: Response): Promise<string> {
  if (!response.body) throw new Error("provider_invalid_response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxBytes) throw new Error("provider_output_limit");
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks).toString("utf8");
}

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
  const key =
    chosen.provider === "openai" ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("setup_required");
  const body =
    chosen.provider === "openai"
      ? {
          model: chosen.model,
          reasoning: { effort: chosen.effort },
          input: prompt,
          text: { format: { type: "json_schema", name: "result", strict: true, schema } },
          max_output_tokens: maxOutputTokens,
          store: false,
          service_tier: "default",
        }
      : {
          model: chosen.model,
          output_config: {
            effort: chosen.effort,
            format: { type: "json_schema", schema: anthropicSchema(schema) },
          },
          messages: [{ role: "user", content: prompt }],
          max_tokens: maxOutputTokens,
        };
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (chosen.provider === "openai") headers.authorization = `Bearer ${key}`;
  else {
    headers["x-api-key"] = key;
    headers["anthropic-version"] = "2023-06-01";
  }
  let response: Response;
  let raw: string;
  const started = Date.now();
  try {
    response = await fetch(
      chosen.provider === "openai"
        ? "https://api.openai.com/v1/responses"
        : "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        redirect: "error",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      },
    );
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`provider_http_${response.status}`);
    }
    raw = await readResponse(response);
  } catch (error) {
    if (
      error instanceof Error &&
      /^provider_(http_\d{3}|output_limit|invalid_response)$/.test(error.message)
    )
      throw error;
    throw new Error("provider_unavailable");
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("provider_invalid_json");
  }
  if (!record(data)) throw new Error("provider_invalid_response");
  let text: string;
  if (chosen.provider === "openai") {
    if (data.status === "failed") throw new Error("provider_failed");
    if (data.status !== "completed") throw new Error("provider_incomplete");
    const output = Array.isArray(data.output) ? data.output : [];
    const messages = output.filter((item) => record(item) && item.type === "message");
    if (
      output.some(
        (item) => !record(item) || !["message", "reasoning"].includes(String(item.type)),
      ) ||
      messages.length !== 1
    )
      throw new Error("provider_invalid_response");
    const content: unknown[] = Array.isArray(messages[0].content) ? messages[0].content : [];
    if (content.some((item) => record(item) && item.type === "refusal"))
      throw new Error("provider_refused");
    if (
      content.length !== 1 ||
      !record(content[0]) ||
      content[0].type !== "output_text" ||
      typeof content[0].text !== "string"
    )
      throw new Error("provider_invalid_response");
    text = content[0].text;
  } else {
    if (data.stop_reason === "refusal") throw new Error("provider_refused");
    if (data.stop_reason !== "end_turn") throw new Error("provider_incomplete");
    const content: unknown[] = Array.isArray(data.content) ? data.content : [];
    if (
      content.some(
        (item) =>
          !record(item) || !["text", "thinking", "redacted_thinking"].includes(String(item.type)),
      )
    )
      throw new Error("provider_invalid_response");
    const texts = content.filter(
      (item): item is Record<string, unknown> => record(item) && item.type === "text",
    );
    if (texts.length !== 1 || typeof texts[0]?.text !== "string")
      throw new Error("provider_invalid_response");
    text = texts[0].text;
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("provider_invalid_json");
  }
  if (!matches(schema, value)) throw new Error("provider_schema_mismatch");
  if (typeof data.model !== "string" || !/^[a-zA-Z0-9._-]{1,128}$/.test(data.model))
    throw new Error("provider_invalid_response");
  const execution = {
    selection: chosen,
    actualModel: data.model,
    effort: "sent_and_accepted",
    maxOutputTokens,
    durationMs: Date.now() - started,
    usage: record(data.usage)
      ? Object.fromEntries(
          Object.entries(data.usage).filter(
            (entry) => typeof entry[1] === "number" && Number.isFinite(entry[1]) && entry[1] >= 0,
          ),
        )
      : null,
    requestId: (response.headers.get("x-request-id") ?? response.headers.get("request-id") ?? "")
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 128),
  };
  console.log(JSON.stringify({ kind: "model_execution", ...execution }));
  if (process.env.AI_MODEL_RECEIPTS_DIR) {
    const receipt = JSON.stringify({
      version: 1,
      request: body,
      response: data,
      rawResponse: raw,
      execution,
    }).replaceAll(key, "[redacted]");
    const hash = createHash("sha256").update(receipt).digest("hex");
    try {
      await mkdir(process.env.AI_MODEL_RECEIPTS_DIR, { recursive: true });
      await writeFile(join(process.env.AI_MODEL_RECEIPTS_DIR, `${hash}.json`), receipt, {
        flag: "wx",
      });
    } catch {
      throw new Error("provider_receipt_unavailable");
    }
  }
  return value;
}
