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

function job(source: string, name: string): string {
  const start = source.indexOf(`\n  ${name}:\n`);
  if (start === -1) return "";
  const next = source.slice(start + 1).search(/\n {2}\S/);
  return next === -1 ? source.slice(start) : source.slice(start, start + 1 + next);
}

function appTokenUses(source: string): string[] {
  return [...source.matchAll(/actions\/create-github-app-token|steps\.app\.outputs\.token/g)].map(
    (match) => match[0],
  );
}

function appTokenPermissions(source: string): string[] {
  return [...source.matchAll(/permission-[\w-]+:\s*\S+/g)].map((match) => match[0]);
}

function mergeCalls(path: string, source: string): string[] {
  return mergePatterns
    .filter((pattern) => pattern.test(source))
    .map((pattern) => `${path}: ${pattern.source}`);
}

function claudeCodeVersion(source: string): string | undefined {
  return /npm install --global @anthropic-ai\/claude-code@(\S+)/.exec(source)?.[1];
}

test("the workflow token stays read-only in both jobs", () => {
  expect(permissionEntries(gardener)).toEqual([
    "{}",
    "contents: read",
    "pull-requests: read",
    "contents: read",
  ]);
});

test("the audit job reads only the Claude token and the publish job only the App key", () => {
  expect(secretReferences(job(gardener, "audit"))).toEqual(["secrets.CLAUDE_CODE_OAUTH_TOKEN"]);
  expect(secretReferences(job(gardener, "publish"))).toEqual(["secrets.AI_APP_PRIVATE_KEY"]);
  expect(secretReferences(gardener)).toHaveLength(2);
});

test("only the publish job mints the App token, scoped to branches and pull requests", () => {
  expect(appTokenUses(job(gardener, "audit"))).toEqual([]);
  expect(appTokenUses(gardener)).toEqual(appTokenUses(job(gardener, "publish")));
  expect(appTokenUses(job(gardener, "publish"))).toEqual([
    "actions/create-github-app-token",
    "steps.app.outputs.token",
  ]);
  expect(appTokenPermissions(gardener)).toEqual([
    "permission-contents: write",
    "permission-pull-requests: write",
  ]);
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

test("only the trigger account can start or re-run the gardener", () => {
  expect(/^on: (.*)$/m.exec(gardener)?.[1]).toBe("workflow_dispatch");
  for (const name of ["audit", "publish"])
    expect(job(gardener, name)).toContain("github.triggering_actor == vars.AI_TRIGGER_LOGIN");
  expect(job(gardener, "audit")).toContain("github.event.sender.id == vars.AI_TRIGGER_USER_ID");
});

test("the audit deletes its Git directory before the checkout cleanup runs Git", () => {
  const audit = job(gardener, "audit");
  const claude = audit.indexOf("claude -p");
  expect(claude).toBeGreaterThan(-1);
  expect(audit.lastIndexOf('rm -rf "$GITHUB_WORKSPACE/.git"')).toBeGreaterThan(claude);
});

test("the publish job holds branches that change automation or its guards", () => {
  const publish = job(gardener, "publish");
  expect(/^ +held_paths=\((.*)\)$/m.exec(publish)?.[1]?.split(" ")).toEqual([
    ".github",
    ".claude",
    ".agents/skills/gardener",
    "scripts/ai-automation",
    "scripts/ai-models",
    "tests/harness/gardener-workflow.test.ts",
    "tests/harness/ai-credentials.test.ts",
  ]);
  expect(publish).toContain(
    'git diff --no-renames --name-only "$GITHUB_SHA" "refs/remotes/$branch" -- "${held_paths[@]}"',
  );
});

test("the gardener and the review workflow pin the same Claude Code CLI", () => {
  const reviews = readFileSync(join(root, ".github/workflows/ai.yml"), "utf8");
  expect(claudeCodeVersion(gardener)).toBeDefined();
  expect(claudeCodeVersion(gardener)).toBe(claudeCodeVersion(reviews));
});
