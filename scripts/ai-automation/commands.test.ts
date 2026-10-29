import { afterEach, expect, test, vi } from "vite-plus/test";
import type { ModelSelection } from "../ai-models/index.ts";
import { interpretRequest } from "./commands.ts";

const selection: ModelSelection = { provider: "openai", model: "fixture-model", effort: "high" };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test.each([
  { instructions: "can u pls change this to XYZ", kind: "fix" },
  { instructions: "could you check whether this handles missing values?", kind: "review" },
])("routes $kind through the existing structured transport", async ({ instructions, kind }) => {
  vi.stubEnv("OPENAI_API_KEY", "offline-fixture-key");
  vi.stubEnv("AI_MODEL_RECEIPTS_DIR", "");
  const fetcher = vi.fn(async (_url: string, request: RequestInit) => {
    if (typeof request.body !== "string") throw new Error("Expected a JSON request body");
    const body = JSON.parse(request.body);
    expect(body.model).toBe(selection.model);
    expect(body.input).toContain(instructions);
    expect(body.text.format.schema.properties.kind.enum).toEqual(["review", "fix", "clarify"]);
    const response = {
      status: "completed",
      model: selection.model,
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify({ kind, message: "" }) }],
        },
      ],
    };
    return new Response(`data: ${JSON.stringify({ type: "response.completed", response })}\n\n`, {
      headers: { "content-type": "text/event-stream" },
    });
  });
  vi.stubGlobal("fetch", fetcher);
  await expect(interpretRequest(instructions, selection)).resolves.toBe(kind);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test("uncertain intent fails with a visible clarification question", async () => {
  const runner = vi.fn(async () => ({ kind: "clarify", message: "Which behavior should change?" }));
  await expect(interpretRequest("can you help with this?", selection, runner)).rejects.toThrow(
    /clarify.*Which behavior should change/i,
  );
  expect(runner).toHaveBeenCalledTimes(1);
});

test("invalid structured intent fails instead of silently choosing review", async () => {
  await expect(
    interpretRequest("change this", selection, async () => ({ kind: "execute" })),
  ).rejects.toThrow();
});

test("transport failures propagate without defaulting to review", async () => {
  await expect(
    interpretRequest("change this", selection, async () => {
      throw new Error("provider_unavailable");
    }),
  ).rejects.toThrow("provider_unavailable");
});
