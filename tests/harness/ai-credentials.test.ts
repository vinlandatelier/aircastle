import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { expect, test } from "vite-plus/test";

const root = resolve(import.meta.dirname, "../..");
const scanned = [
  ".github/workflows",
  ".github/ai-models.json",
  "scripts/ai-automation",
  "scripts/ai-models",
];
const banned = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "api.openai.com",
  "api.anthropic.com",
  "x-api-key",
];

function files(path: string): string[] {
  const absolute = join(root, path);
  if (statSync(absolute).isFile()) return [path];
  return readdirSync(absolute, { recursive: true, encoding: "utf8" })
    .map((entry) => relative(root, join(absolute, entry)))
    .filter((entry) => statSync(join(root, entry)).isFile());
}

function apiKeyMentions(path: string, source: string): string[] {
  const lowered = source.toLowerCase();
  return banned
    .filter((needle) => lowered.includes(needle.toLowerCase()))
    .map((needle) => `${path}: ${needle}`);
}

test("AI automation never reaches a provider API key or endpoint", () => {
  const mentions = scanned
    .flatMap(files)
    .flatMap((path) => apiKeyMentions(path, readFileSync(join(root, path), "utf8")));
  expect(mentions).toEqual([]);
});

test.each(banned)("flags %s in automation code or workflows", (needle) => {
  expect(apiKeyMentions(".github/workflows/ai.yml", `          ${needle}: secret\n`)).toEqual([
    `.github/workflows/ai.yml: ${needle}`,
  ]);
});
