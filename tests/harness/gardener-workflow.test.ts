import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { expect, test } from "vite-plus/test";

const root = resolve(import.meta.dirname, "../..");
const gardenerPath = ".github/workflows/gardener.yml";
const gardener = readFileSync(join(root, gardenerPath), "utf8");
const automation = [".github/workflows", "scripts/ai-automation", ".agents/skills/gardener"];
const mergePatterns = [
  /gh\s+["']?pr["']?\s+["']?merge/i,
  /\/merge\b/i,
  /merge-async/i,
  /auto-?merge/i,
  /mergePullRequest/i,
  /enqueuePullRequest/i,
];

function files(path: string): string[] {
  const absolute = join(root, path);
  return readdirSync(absolute, { recursive: true, encoding: "utf8" })
    .map((entry) => relative(root, join(absolute, entry)))
    .filter((entry) => statSync(join(root, entry)).isFile());
}

function permissionEntries(source: string): string[] {
  const lines = source.split("\n");
  return lines.flatMap((line, index) => {
    const match = /^( *)permissions:\s*(.*)$/.exec(line);
    if (!match) return [];
    const [, leading = "", inline = ""] = match;
    if (inline) return [inline.trim()];
    const end = lines.findIndex(
      (next, nextIndex) =>
        nextIndex > index && next.search(/\S/) !== -1 && next.search(/\S/) <= leading.length,
    );
    return lines
      .slice(index + 1, end === -1 ? undefined : end)
      .map((next) => next.trim())
      .filter(Boolean);
  });
}

function secretReferences(source: string): string[] {
  return [...source.matchAll(/\bsecrets\b(?:\.\w+)?/g)].map((match) => match[0]);
}

function mergeCalls(path: string, source: string): string[] {
  return mergePatterns
    .filter((pattern) => pattern.test(source))
    .map((pattern) => `${path}: ${pattern.source}`);
}

function claudeCodeVersion(source: string): string | undefined {
  return /npm install --global @anthropic-ai\/claude-code@(\S+)/.exec(source)?.[1];
}

test("the gardener can write branches and pull requests and nothing else", () => {
  expect(permissionEntries(gardener)).toEqual([
    "{}",
    "contents: read",
    "pull-requests: read",
    "contents: write",
    "pull-requests: write",
  ]);
});

test("the gardener reads no secret except the Claude subscription token", () => {
  expect(new Set(secretReferences(gardener))).toEqual(new Set(["secrets.CLAUDE_CODE_OAUTH_TOKEN"]));
  expect(gardener.match(/secrets\.CLAUDE_CODE_OAUTH_TOKEN/g)).toHaveLength(1);
});

test("AI automation never merges, approves for merge, or enables auto-merge", () => {
  const calls = automation
    .flatMap(files)
    .flatMap((path) => mergeCalls(path, readFileSync(join(root, path), "utf8")));
  expect(calls).toEqual([]);
});

test.each([
  'gh pr merge "$pr" --squash',
  "gh  pr  merge --auto 12",
  "gh pr 'merge' 12",
  "gh api -X PUT repos/o/r/pulls/12/merge",
  "gh api -X PUT repos/o/r/pulls/12/merge-async -f sha=abc",
  "gh pr edit 12 --enable-automerge",
  "mutation { enablePullRequestAutoMerge(input: {}) { clientMutationId } }",
  "mutation { mergePullRequest(input: {}) { clientMutationId } }",
  "mutation { enqueuePullRequest(input: {}) { clientMutationId } }",
])("flags a merge call: %s", (call) => {
  expect(mergeCalls(gardenerPath, `      - run: ${call}\n`)).not.toEqual([]);
});

test("permission checks catch broadened or added rights", () => {
  expect(permissionEntries("permissions: write-all\n")).toEqual(["write-all"]);
  expect(
    permissionEntries(
      "    permissions:\n      contents: write\n      actions: write\n    steps:\n",
    ),
  ).toEqual(["contents: write", "actions: write"]);
});

test("secret checks catch any other secret reference", () => {
  expect(secretReferences("secrets: inherit\n${{ secrets['X'] }}\n${{ secrets.OTHER }}")).toEqual([
    "secrets",
    "secrets",
    "secrets.OTHER",
  ]);
});

test("the gardener runs one at a time, only from main, only for the trigger login or the schedule", () => {
  expect(gardener).toContain("concurrency:\n  group: gardener\n  cancel-in-progress: false\n");
  expect(gardener).toContain("github.ref == 'refs/heads/main'");
  expect(gardener).toContain("vars.AI_TRIGGER_LOGIN != ''");
  expect(gardener).toContain(
    "(github.event_name == 'schedule' || github.triggering_actor == vars.AI_TRIGGER_LOGIN)",
  );
});

test("the gardener and the review workflow pin the same Claude Code CLI", () => {
  const reviews = readFileSync(join(root, ".github/workflows/ai.yml"), "utf8");
  expect(claudeCodeVersion(gardener)).toBeDefined();
  expect(claudeCodeVersion(gardener)).toBe(claudeCodeVersion(reviews));
});
