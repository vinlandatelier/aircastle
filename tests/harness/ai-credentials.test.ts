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

/**
 * The model job must name both key variables to refuse them. This exact step is the only allowed
 * mention. Any edit to it, such as passing a secret into its environment, removes the exception.
 */
const refusalStep = {
  path: ".github/workflows/ai.yml",
  text: [
    "      - name: Refuse provider API keys",
    "        run: |",
    "          for name in ANTHROPIC_API_KEY OPENAI_API_KEY; do",
    '            if [ -n "$(printenv "$name")" ]; then',
    '              echo "::error::$name is set. AI reviews run only on the Claude subscription token."',
    "              exit 1",
    "            fi",
    "          done",
    "",
  ].join("\n"),
};

function files(path: string): string[] {
  const absolute = join(root, path);
  if (statSync(absolute).isFile()) return [path];
  return readdirSync(absolute, { recursive: true, encoding: "utf8" })
    .map((entry) => relative(root, join(absolute, entry)))
    .filter((entry) => statSync(join(root, entry)).isFile());
}

function apiKeyMentions(path: string, source: string): string[] {
  const text =
    path === refusalStep.path && source.split(refusalStep.text).length === 2
      ? source.replace(refusalStep.text, "")
      : source;
  const lowered = text.toLowerCase();
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

test("the model job keeps its API key refusal step", () => {
  const workflow = readFileSync(join(root, refusalStep.path), "utf8");
  expect(workflow.split(refusalStep.text)).toHaveLength(2);
});

test.each(banned)("flags %s anywhere outside the refusal step", (needle) => {
  expect(apiKeyMentions("scripts/ai-models/index.ts", `const value = "${needle}";`)).toEqual([
    `scripts/ai-models/index.ts: ${needle}`,
  ]);
  expect(
    apiKeyMentions(refusalStep.path, `${refusalStep.text}          ${needle}: secret\n`),
  ).toEqual([`${refusalStep.path}: ${needle}`]);
});

test("a copied refusal step loses the exception", () => {
  expect(apiKeyMentions(refusalStep.path, `${refusalStep.text}${refusalStep.text}`)).toHaveLength(
    2,
  );
});
