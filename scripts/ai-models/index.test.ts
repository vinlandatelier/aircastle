import { afterEach, expect, test, vi } from "vite-plus/test";
import { parseModelConfig, runModel, type ModelSelection } from "./index.ts";

const openai: ModelSelection = { provider: "openai", model: "gpt-6-astra", effort: "high" };
const anthropic: ModelSelection = {
  provider: "anthropic",
  model: "claude-opus-5-5",
  effort: "high",
};
const schema = {
  type: "object",
  properties: { ok: { type: "boolean" } },
  required: ["ok"],
  additionalProperties: false,
};
const config = {
  version: 1,
  roles: {
    codexReviewer: openai,
    codexImplementer: openai,
    claudeReviewer: anthropic,
    claudeImplementer: anthropic,
  },
};
type Event = { type: string } & Record<string, unknown>;
const stream = (events: Event[], chunkSize = Infinity) => {
  const bytes = new TextEncoder().encode(
    events
      .map((event) => `event: ${event.type}\r\ndata: ${JSON.stringify(event)}\r\n\r\n`)
      .join(""),
  );
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let index = 0; index < bytes.length; index += chunkSize)
          controller.enqueue(bytes.slice(index, index + chunkSize));
        controller.close();
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
};
const openaiStream = (response: Record<string, unknown>): Event[] => [
  { type: "response.created", response: { status: "in_progress" } },
  { type: `response.${String(response.status)}`, response },
];
const anthropicStream = (
  message: { content: Record<string, unknown>[] } & Record<string, unknown>,
): Event[] => [
  { type: "message_start", message: { ...message, content: [], stop_reason: null } },
  { type: "ping" },
  ...message.content.flatMap((block, index): Event[] =>
    block.type === "text"
      ? [
          { type: "content_block_start", index, content_block: { type: "text", text: "" } },
          ...String(block.text)
            .split(/(?<=,)/)
            .map((text) => ({
              type: "content_block_delta",
              index,
              delta: { type: "text_delta", text },
            })),
          { type: "content_block_stop", index },
        ]
      : [
          { type: "content_block_start", index, content_block: { ...block, thinking: "" } },
          { type: "content_block_delta", index, delta: { type: "thinking_delta", thinking: "" } },
          {
            type: "content_block_delta",
            index,
            delta: { type: "signature_delta", signature: "sig" },
          },
          { type: "content_block_stop", index },
        ],
  ),
  {
    type: "message_delta",
    delta: { stop_reason: message.stop_reason },
    usage: { output_tokens: 9 },
  },
  { type: "message_stop" },
];
const response = (body: Record<string, unknown>) =>
  stream(
    "status" in body
      ? openaiStream(body)
      : anthropicStream(body as { content: Record<string, unknown>[] }),
  );
const completed = (text: string) => ({
  status: "completed",
  model: openai.model,
  output: [{ type: "message", content: [{ type: "output_text", text }] }],
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

test("config requires exactly four correctly paired roles and explicit effort", () => {
  expect(parseModelConfig(config)).toEqual(config);
  expect(() =>
    parseModelConfig({ ...config, roles: { ...config.roles, claudeReviewer: openai } }),
  ).toThrow();
  expect(() => parseModelConfig({ ...config, roles: { codexReviewer: openai } })).toThrow();
  expect(() => parseModelConfig({ ...config, url: "https://evil.invalid" })).toThrow();
  expect(() =>
    parseModelConfig({
      ...config,
      roles: { ...config.roles, codexReviewer: { ...openai, effort: "super" } },
    }),
  ).toThrow();
});

test("missing matching key reports setup_required before any network call", async () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "other-secret");
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  await expect(runModel(openai, "review", schema)).rejects.toThrow("setup_required");
  expect(fetcher).not.toHaveBeenCalled();
});

test.each([openai, anthropic])(
  "%s sends strict schema and exact settings only to fixed official endpoints",
  async (selection) => {
    vi.stubEnv("OPENAI_API_KEY", "openai-secret");
    vi.stubEnv("ANTHROPIC_API_KEY", "anthropic-secret");
    vi.stubEnv("OPENAI_BASE_URL", "https://evil.invalid");
    const fetcher = vi.fn(async () =>
      response(
        selection.provider === "openai"
          ? completed('{"ok":true}')
          : {
              model: selection.model,
              stop_reason: "end_turn",
              content: [{ type: "text", text: '{"ok":true}' }],
            },
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    await expect(runModel(selection, "review untrusted text", schema)).resolves.toEqual({
      ok: true,
    });
    const [url, request] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      selection.provider === "openai"
        ? "https://api.openai.com/v1/responses"
        : "https://api.anthropic.com/v1/messages",
    );
    if (typeof request.body !== "string") throw new Error("missing request");
    const body = JSON.parse(request.body);
    expect(body.model).toBe(selection.model);
    expect(body.tools).toBeUndefined();
    expect(request.redirect).toBe("error");
    expect(request.signal).toBeInstanceOf(AbortSignal);
    if (selection.provider === "openai") {
      expect(body.reasoning).toEqual({ effort: "high" });
      expect(body.text.format).toEqual({
        type: "json_schema",
        name: "result",
        strict: true,
        schema,
      });
      expect(body.stream).toBe(true);
    } else {
      expect(body.output_config).toEqual({
        effort: "high",
        format: { type: "json_schema", schema },
      });
      expect(body.stream).toBe(true);
    }
    expect(JSON.stringify(request)).not.toContain(
      selection.provider === "openai" ? "anthropic-secret" : "openai-secret",
    );
  },
);

test.each([
  { status: "incomplete", output: [] },
  {
    status: "completed",
    output: [{ type: "message", content: [{ type: "refusal", refusal: "key-secret" }] }],
  },
  completed('{"ok":"true"}'),
  completed('{"ok":true,"extra":1}'),
  completed("invalid key-secret"),
])(
  "rejects incomplete, refused and schema-invalid OpenAI output without echoing it",
  async (body) => {
    vi.stubEnv("OPENAI_API_KEY", "key-secret");
    vi.stubGlobal("fetch", async () => response(body));
    await expect(runModel(openai, "review", schema)).rejects.toThrow(/^(?!.*key-secret)/);
  },
);

test.each(["max_tokens", "refusal", "tool_use", "pause_turn"])(
  "rejects Anthropic %s stop",
  async (stop_reason) => {
    vi.stubEnv("ANTHROPIC_API_KEY", "key-secret");
    vi.stubGlobal("fetch", async () =>
      response({ stop_reason, content: [{ type: "text", text: '{"ok":true}' }] }),
    );
    await expect(runModel(anthropic, "review", schema)).rejects.toThrow();
  },
);

test.each([
  ["low", 64_000],
  ["medium", 64_000],
  ["high", 64_000],
  ["xhigh", 128_000],
  ["max", 128_000],
] as const)(
  "%s effort leaves both providers room to reason before answering (%i tokens)",
  async (effort, cap) => {
    vi.stubEnv("OPENAI_API_KEY", "openai-secret");
    vi.stubEnv("ANTHROPIC_API_KEY", "anthropic-secret");
    const fetcher = vi.fn(async (url: string, _request: RequestInit) =>
      response(
        url.includes("openai")
          ? completed('{"ok":true}')
          : {
              model: anthropic.model,
              stop_reason: "end_turn",
              content: [{ type: "text", text: '{"ok":true}' }],
            },
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    await runModel({ ...openai, effort }, "review", schema);
    await runModel({ ...anthropic, effort }, "review", schema);
    const bodies = fetcher.mock.calls.map(([, request]) => {
      if (typeof request.body !== "string") throw new Error("missing request");
      return JSON.parse(request.body);
    });
    expect(bodies[0].max_output_tokens).toBe(cap);
    expect(bodies[1].max_tokens).toBe(cap);
  },
);

test("config accepts xhigh effort for Anthropic roles", () => {
  const roles = { ...config.roles, claudeReviewer: { ...anthropic, effort: "xhigh" } };
  expect(parseModelConfig({ ...config, roles }).roles.claudeReviewer.effort).toBe("xhigh");
});

test("Anthropic answer is reassembled from thinking and text deltas split across chunks", async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "key-secret");
  const answer = { ok: true, note: "first, second, third" };
  const events = anthropicStream({
    model: anthropic.model,
    stop_reason: "end_turn",
    content: [
      { type: "thinking", signature: "" },
      { type: "text", text: JSON.stringify(answer) },
    ],
  });
  vi.stubGlobal("fetch", async () => stream(events, 7));
  const noted = {
    ...schema,
    properties: { ...schema.properties, note: { type: "string" } },
    required: ["ok", "note"],
  };
  await expect(runModel(anthropic, "review", noted)).resolves.toEqual(answer);
});

test.each<[string, ModelSelection, Event[]]>([
  ["Anthropic", anthropic, [{ type: "message_start", message: { model: anthropic.model } }]],
  ["OpenAI", openai, [{ type: "response.created", response: { status: "in_progress" } }]],
])("%s stream that ends before its final event is incomplete", async (_, selection, events) => {
  vi.stubEnv("OPENAI_API_KEY", "key-secret");
  vi.stubEnv("ANTHROPIC_API_KEY", "key-secret");
  vi.stubGlobal("fetch", async () => stream(events));
  await expect(runModel(selection, "review", schema)).rejects.toThrow("provider_incomplete");
});

test.each([anthropic, openai])("%s error event fails without echoing it", async (selection) => {
  vi.stubEnv("OPENAI_API_KEY", "key-secret");
  vi.stubEnv("ANTHROPIC_API_KEY", "key-secret");
  vi.stubGlobal("fetch", async () =>
    stream([{ type: "error", error: { type: "overloaded_error", message: "key-secret" } }]),
  );
  await expect(runModel(selection, "review", schema)).rejects.toThrow("provider_failed");
});

test("rejects unsupported schemas and oversized prompts before spending", async () => {
  vi.stubEnv("OPENAI_API_KEY", "key-secret");
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  await expect(runModel(openai, "review", { ...schema, magicKeyword: true })).rejects.toThrow();
  await expect(runModel(openai, "x".repeat(200_001), schema)).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});

test("network errors and non-OK bodies never disclose secrets", async () => {
  vi.stubEnv("OPENAI_API_KEY", "key-secret");
  vi.stubGlobal("fetch", async () => {
    throw new Error("key-secret https://private");
  });
  await expect(runModel(openai, "review", schema)).rejects.toThrow("provider_unavailable");
  vi.stubGlobal("fetch", async () => new Response("key-secret", { status: 401 }));
  await expect(runModel(openai, "review", schema)).rejects.toThrow("provider_http_401");
});

test("a failed provider response is distinguished from incomplete output without echoing its error", async () => {
  vi.stubEnv("OPENAI_API_KEY", "key-secret");
  vi.stubGlobal("fetch", async () =>
    response({ status: "failed", error: { message: "key-secret" }, output: [] }),
  );
  await expect(runModel(openai, "review", schema)).rejects.toThrow("provider_failed");
});

test("Anthropic transport describes unsupported bounds while local validation still enforces them", async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "key-secret");
  const bounded = {
    type: "object",
    properties: {
      findings: {
        type: "array",
        minItems: 2,
        maxItems: 8,
        items: {
          type: "object",
          properties: {
            line: { type: "integer", minimum: 1, maximum: 100 },
            quote: { type: "string", minLength: 12, maxLength: 12000, description: "Exact quote." },
          },
          required: ["line", "quote"],
          additionalProperties: false,
        },
      },
    },
    required: ["findings"],
    additionalProperties: false,
  };
  const original = structuredClone(bounded);
  const fetcher = vi.fn(async () =>
    response({
      model: anthropic.model,
      stop_reason: "end_turn",
      content: [
        { type: "text", text: JSON.stringify({ findings: [{ line: 0, quote: "short" }] }) },
      ],
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  await expect(runModel(anthropic, "review", bounded)).rejects.toThrow("provider_schema_mismatch");
  const request = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  if (typeof request[1].body !== "string") throw new Error("missing request");
  const transport = JSON.parse(request[1].body).output_config.format.schema;
  expect(transport.properties.findings.minItems).toBeUndefined();
  expect(transport.properties.findings.maxItems).toBeUndefined();
  expect(transport.properties.findings.description).toContain("maxItems: 8");
  expect(transport.properties.findings.items.properties.line).toEqual({
    type: "integer",
    description: "{minimum: 1} {maximum: 100}",
  });
  expect(transport.properties.findings.items.properties.quote).toEqual({
    type: "string",
    description: "Exact quote. {minLength: 12} {maxLength: 12000}",
  });
  expect(bounded).toEqual(original);
});
