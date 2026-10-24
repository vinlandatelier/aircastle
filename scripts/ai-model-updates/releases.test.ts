import { createHash } from "node:crypto";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { readFile } from "node:fs/promises";
import { parseModelConfig } from "../ai-models/index.ts";
import { discoverCandidates } from "./releases.ts";
import { digest } from "./index.ts";

const config = parseModelConfig(
  JSON.parse(await readFile(new URL("../../.github/ai-models.json", import.meta.url), "utf8")),
);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function mockOfficial(reject = false, missingPrice = false) {
  vi.stubEnv("OPENAI_API_KEY", "openai-test");
  vi.stubEnv("ANTHROPIC_API_KEY", "anthropic-test");
  vi.stubGlobal("fetch", async (url: string, request: RequestInit) => {
    expect(request.redirect).toBe("error");
    if (reject) return new Response("unavailable secret", { status: 503 });
    if (url.startsWith("https://api.openai.com/"))
      return Response.json({
        data: [
          { id: "gpt-reviewed", created: 1 },
          { id: "gpt-newest", created: 999 },
          { id: "gpt-6-astra" },
          { id: "gpt-6.1-sol" },
        ],
      });
    if (url.startsWith("https://api.anthropic.com/"))
      return Response.json({
        data: [{ id: "claude-reviewed" }, { id: "claude-fable-5-1" }, { id: "claude-opus-5-5" }],
        has_more: false,
      });
    if (url.includes("changelog") || url.includes("release-notes"))
      return new Response("Official release guidance ".repeat(8));
    if (url.endsWith("models.md"))
      return new Response(
        "For coding and reasoning use gpt-reviewed. Alternative gpt-newest. Current gpt-6-astra gpt-6.1-sol.",
      );
    if (url.endsWith("models/overview"))
      return new Response(
        '<p>For coding and reasoning: claude-reviewed claude-fable-5-1 claude-opus-5-5.</p><a href="/docs/en/models/reviewed/overview">reviewed</a><a href="/docs/en/models/fable/overview">fable</a><a href="/docs/en/models/opus/overview">opus</a>',
      );
    if (url.startsWith("https://developers.openai.com/"))
      return new Response(
        `${url} structured_outputs effort \`high\` ${missingPrice ? "" : "| Input | $10 | 1M tokens | Output | $50 | 1M tokens |"}`,
      );
    const id = url.includes("/reviewed/")
      ? "claude-reviewed"
      : url.includes("/fable/")
        ? "claude-fable-5-1"
        : "claude-opus-5-5";
    return new Response(`<p>${id}</p><p>Input $10 Output $50</p>`);
  });
}

test("discovery intersects official coding guidance with account IDs and never ranks timestamps as quality", async () => {
  mockOfficial();
  const result = await discoverCandidates(config);
  expect(result.candidates.map((item) => item.selection.model)).toEqual([
    "gpt-reviewed",
    "claude-reviewed",
  ]);
  expect(result.candidates.every((item) => item.selection.effort === "high")).toBe(true);
  expect(
    result.sources.every(
      (source) => source.sha256 === createHash("sha256").update(source.body).digest("hex"),
    ),
  ).toBe(true);
  expect(result.prices).toHaveLength(6);
});

test("discovery errors or absent official price evidence fail closed", async () => {
  const before = digest(config);
  mockOfficial(true);
  await expect(discoverCandidates(config)).rejects.toThrow("discovery_unavailable");
  mockOfficial(false, true);
  await expect(discoverCandidates(config)).rejects.toThrow("pricing_unavailable");
  expect(digest(config)).toBe(before);
});
