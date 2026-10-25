import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { expect, test } from "vite-plus/test";

const root = resolve(import.meta.dirname, "../..");
const gardenerPath = ".github/workflows/gardener.yml";
const gardener = readFileSync(join(root, gardenerPath), "utf8");
const settingsPath = ".github/gardener-settings.json";
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

test("permission checks catch broadened or added rights", () => {
  expect(permissionEntries("permissions: write-all\n")).toEqual(["write-all"]);
  expect(
    permissionEntries(
      "    permissions:\n      contents: write\n      actions: write\n    steps:\n",
    ),
  ).toEqual(["contents: write", "actions: write"]);
});

test("job sections end at the next job", () => {
  const source =
    "jobs:\n  audit:\n    steps:\n      - run: a\n  publish:\n    steps:\n      - run: b\n";
  expect(job(source, "audit")).not.toContain("run: b");
  expect(job(source, "publish")).toContain("run: b");
  expect(job(source, "missing")).toBe("");
});

test("secret checks catch any other secret reference", () => {
  expect(secretReferences("secrets: inherit\n${{ secrets['X'] }}\n${{ secrets.OTHER }}")).toEqual([
    "secrets",
    "secrets",
    "secrets.OTHER",
  ]);
});

test("the gardener runs one at a time, only from main, only for the trigger account or the schedule", () => {
  expect(gardener).toContain("concurrency:\n  group: gardener\n  cancel-in-progress: false\n");
  expect(gardener).toContain("github.ref == 'refs/heads/main'");
  expect(gardener).toContain("vars.AI_TRIGGER_LOGIN != '' && vars.AI_TRIGGER_USER_ID != ''");
  expect(gardener).toContain(
    "(github.event_name == 'schedule' || (github.triggering_actor == vars.AI_TRIGGER_LOGIN &&\n      github.event.sender.id == vars.AI_TRIGGER_USER_ID))",
  );
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

test("Claude sees only number, title, branch and state of the owner's and gardener PRs", () => {
  const queries = job(gardener, "audit")
    .split("\n")
    .filter((line) => /\bgh\s+pr\s+list\b/.test(line));
  expect(queries).toHaveLength(2);
  for (const query of queries) {
    expect(query).toContain("--json number,title,state,headRefName");
    expect(
      query.includes('--author "$AI_TRIGGER_LOGIN"') !== query.includes("--label gardener"),
    ).toBe(true);
  }
  expect(job(gardener, "audit")).toContain("map({number, title, headRefName, state})");
  expect(job(gardener, "audit")).toContain("AI_TRIGGER_LOGIN: ${{ vars.AI_TRIGGER_LOGIN }}");
});

test("the audit uploads only its output directory", () => {
  expect([...gardener.matchAll(/^ +path: (.*)$/gm)].map((match) => match[1])).toEqual([
    "${{ runner.temp }}/gardener/out",
    "${{ runner.temp }}/gardener/out",
  ]);
});

test("the audit job never saves the dependency cache", () => {
  const setup = readFileSync(join(root, ".github/actions/setup/action.yml"), "utf8");
  expect(setup).toContain("cache-save: ${{ inputs.cache-save }}");
  expect(job(gardener, "audit")).toContain(
    "      - uses: ./.github/actions/setup\n        with:\n          cache-save: false\n",
  );
});

test("Claude runs with sandboxed commands and explicit tools instead of skipped permissions", () => {
  const settings = JSON.parse(readFileSync(join(root, settingsPath), "utf8"));
  expect(settings).toEqual({
    permissions: {
      defaultMode: "dontAsk",
      allow: ["Bash", "Agent", "Skill", "TodoWrite"],
      deny: ["WebFetch", "WebSearch", "Read(//proc/**)"],
    },
    sandbox: {
      enabled: true,
      failIfUnavailable: true,
      allowUnsandboxedCommands: false,
      autoAllowBashIfSandboxed: true,
      network: { allowedDomains: ["registry.npmjs.org"], strictAllowlist: true },
      credentials: { envVars: [{ name: "CLAUDE_CODE_OAUTH_TOKEN", mode: "deny" }] },
    },
  });
  const audit = job(gardener, "audit");
  expect(audit).not.toMatch(/dangerously|bypassPermissions|permission-mode/);
  expect(audit).toContain(`.github/gardener-settings.json > "$CLAUDE_CONFIG_DIR/settings.json"`);
  expect(audit).toContain('--settings "$CLAUDE_CONFIG_DIR/settings.json"');
  expect(audit).toContain('CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: "1"');
  expect(audit.indexOf("sudo systemctl stop docker.socket docker.service")).toBeGreaterThan(-1);
  expect(audit.indexOf("sudo systemctl stop docker.socket")).toBeLessThan(
    audit.indexOf("claude -p"),
  );
});

test("the gardener and the review workflow pin the same Claude Code CLI", () => {
  const reviews = readFileSync(join(root, ".github/workflows/ai.yml"), "utf8");
  expect(claudeCodeVersion(gardener)).toBeDefined();
  expect(claudeCodeVersion(gardener)).toBe(claudeCodeVersion(reviews));
});
