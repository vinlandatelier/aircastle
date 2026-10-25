import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { anthropicSchema, checkSchema, matches, record } from "./schema.ts";

export type Role = "codexReviewer" | "codexImplementer" | "claudeReviewer" | "claudeImplementer";
export type Provider = "openai" | "anthropic";
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export type ModelSelection = { provider: Provider; model: string; effort: Effort };
export type ModelConfig = { version: 1; roles: Record<Role, ModelSelection> };

const roles: Role[] = ["codexReviewer", "codexImplementer", "claudeReviewer", "claudeImplementer"];
const efforts: Record<Provider, readonly Effort[]> = {
  openai: ["low", "medium", "high", "xhigh", "max"],
  anthropic: ["low", "medium", "high", "xhigh", "max"],
};
/**
 * Output cap per request, counting reasoning or thinking tokens as well as the visible answer.
 * OpenAI counts reasoning tokens against `max_output_tokens` and advises reserving at least
 * 25,000. Anthropic counts thinking against `max_tokens` and advises at least 64,000 at `xhigh`
 * and `max`. Every configured model accepts up to 128,000 output tokens. Both providers need a
 * streamed response at these sizes.
 */
const outputTokenCaps: Record<Effort, number> = {
  low: 64_000,
  medium: 64_000,
  high: 64_000,
  xhigh: 128_000,
  max: 128_000,
};
const maxStreamBytes = 64 * 1_048_576;
const requestTimeoutMs = 25 * 60_000;

function selection(value: unknown): ModelSelection {
  if (
    !record(value) ||
    Object.keys(value).sort().join() !== "effort,model,provider" ||
    (value.provider !== "openai" && value.provider !== "anthropic") ||
    typeof value.model !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value.model) ||
    typeof value.effort !== "string"
  )
    throw new Error("invalid_model_config");
  const effort = efforts[value.provider].find((candidate) => candidate === value.effort);
  if (!effort) throw new Error("invalid_model_config");
  return { provider: value.provider, model: value.model, effort };
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

async function* serverEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<Record<string, unknown>> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxStreamBytes) throw new Error("provider_output_limit");
      buffer = (buffer + decoder.decode(part.value, { stream: true })).replaceAll("\r\n", "\n");
      for (let end = buffer.indexOf("\n\n"); end !== -1; end = buffer.indexOf("\n\n")) {
        const data = buffer
          .slice(0, end)
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        buffer = buffer.slice(end + 2);
        if (!data) continue;
        let event: unknown;
        try {
          event = JSON.parse(data);
        } catch (error) {
          throw new Error("provider_invalid_json", { cause: error });
        }
        if (!record(event)) throw new Error("provider_invalid_response");
        yield event;
      }
    }
  } finally {
    await reader.cancel();
  }
}

async function openaiResponse(body: ReadableStream<Uint8Array>): Promise<Record<string, unknown>> {
  for await (const event of serverEvents(body)) {
    if (event.type === "error") throw new Error("provider_failed");
    if (
      ["response.completed", "response.incomplete", "response.failed"].includes(String(event.type))
    ) {
      if (!record(event.response)) throw new Error("provider_invalid_response");
      return event.response;
    }
  }
  throw new Error("provider_incomplete");
}

async function anthropicMessage(
  body: ReadableStream<Uint8Array>,
): Promise<Record<string, unknown>> {
  let message: Record<string, unknown> | null = null;
  const content: Record<string, unknown>[] = [];
  for await (const event of serverEvents(body)) {
    if (event.type === "error") throw new Error("provider_failed");
    if (event.type === "message_start") {
      if (!record(event.message)) throw new Error("provider_invalid_response");
      message = { ...event.message };
    } else if (event.type === "content_block_start") {
      if (!Number.isSafeInteger(event.index) || !record(event.content_block))
        throw new Error("provider_invalid_response");
      content[Number(event.index)] = { ...event.content_block };
    } else if (event.type === "content_block_delta") {
      const block = content[Number(event.index)];
      const delta = event.delta;
      if (!block || !record(delta)) throw new Error("provider_invalid_response");
      if (delta.type === "text_delta" && typeof delta.text === "string")
        block.text = `${typeof block.text === "string" ? block.text : ""}${delta.text}`;
      if (delta.type === "thinking_delta" && typeof delta.thinking === "string")
        block.thinking = `${typeof block.thinking === "string" ? block.thinking : ""}${delta.thinking}`;
    } else if (event.type === "message_delta") {
      if (!message || !record(event.delta)) throw new Error("provider_invalid_response");
      Object.assign(message, event.delta);
      if (record(event.usage))
        message.usage = { ...(record(message.usage) ? message.usage : {}), ...event.usage };
    } else if (event.type === "message_stop") {
      if (!message) throw new Error("provider_invalid_response");
      return { ...message, content: Array.from(content) };
    }
  }
  throw new Error("provider_incomplete");
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
          max_output_tokens: outputTokenCaps[chosen.effort],
          stream: true,
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
          max_tokens: outputTokenCaps[chosen.effort],
          stream: true,
        };
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (chosen.provider === "openai") headers.authorization = `Bearer ${key}`;
  else {
    headers["x-api-key"] = key;
    headers["anthropic-version"] = "2023-06-01";
  }
  let response: Response;
  let data: Record<string, unknown>;
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
        signal: AbortSignal.timeout(requestTimeoutMs),
      },
    );
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`provider_http_${response.status}`);
    }
    if (!response.body) throw new Error("provider_invalid_response");
    data =
      chosen.provider === "openai"
        ? await openaiResponse(response.body)
        : await anthropicMessage(response.body);
  } catch (error) {
    if (
      error instanceof Error &&
      /^provider_(http_\d{3}|output_limit|invalid_response|invalid_json|failed|incomplete)$/.test(
        error.message,
      )
    )
      throw error;
    throw new Error("provider_unavailable", { cause: error });
  }
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
    maxOutputTokens: outputTokenCaps[chosen.effort],
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
