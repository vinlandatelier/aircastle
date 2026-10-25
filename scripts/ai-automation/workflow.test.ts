import { readFileSync } from "node:fs";
import { expect, test } from "vite-plus/test";

const workflow = readFileSync(".github/workflows/ai.yml", "utf8");
const guide = readFileSync(".github/AGENTS.md", "utf8");
const jobs = [...workflow.slice(workflow.indexOf("\njobs:\n")).matchAll(/\n {2}([a-z]+):\n/g)].map(
  (match) => match[1] ?? "",
);
const job = (name: string) => {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  const end = workflow.slice(start + 1).search(/\n {2}[a-z]+:\n/);
  return workflow.slice(start, end === -1 ? undefined : start + 1 + end);
};
const condition = (name: string) => {
  const match = /\n {4}if: (?:>-\n((?: {6}.*\n)+)|(.*)\n)/.exec(job(name));
  return (match?.[1] ?? match?.[2])
    ?.split("\n")
    .map((line) => line.trim())
    .join(" ")
    .trim();
};

test("comment events start planning only for PR comments that mention @vinland-ai from the trigger login", () => {
  const gate = condition("prepare");
  expect(gate).toContain("github.event_name == 'issue_comment'");
  expect(gate).toContain("github.event.issue.pull_request");
  expect(gate).toContain("contains(github.event.comment.body, '@vinland-ai')");
  expect(gate).not.toContain("@claude");
  expect(gate).toContain("vars.AI_TRIGGER_LOGIN != ''");
  expect(gate).toContain("github.event.comment.user.login == vars.AI_TRIGGER_LOGIN");
  expect(gate).toContain("vars.AI_TRIGGER_USER_ID != ''");
  expect(gate).toContain("github.event.comment.user.id == vars.AI_TRIGGER_USER_ID");
  expect(gate).not.toContain("author_association");
});

test("job-level conditions read only variables the guide says to set at repository level", () => {
  const repositoryLine = guide
    .split("\n")
    .find((line) => line.startsWith("- Set the repository variables"));
  const repositoryVariables = [...(repositoryLine ?? "").matchAll(/`(AI_[A-Z_]+)`/g)].map(
    (match) => match[1],
  );
  const conditionVariables = jobs.flatMap((name) =>
    [...(condition(name) ?? "").matchAll(/\bvars\.([A-Za-z_]+)/g)].map((match) => match[1]),
  );
  expect(jobs).toEqual(["prepare", "model", "verify", "publish"]);
  for (const name of conditionVariables) expect(repositoryVariables).toContain(name);
});

test("the model job refuses provider API keys before it runs the subscription CLI", () => {
  const model = job("model");
  const refusal = model.indexOf("name: Refuse provider API keys");
  expect(refusal).toBeGreaterThan(model.indexOf("npm install --global @anthropic-ai/claude-code@"));
  expect(refusal).toBeLessThan(model.indexOf("node scripts/ai-automation/cli.ts model"));
  expect(model).toContain("CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}");
});

test("both coordinator jobs receive the trigger login and user ID", () => {
  for (const name of ["prepare", "publish"]) {
    expect(job(name)).toContain("AI_TRIGGER_LOGIN: ${{ vars.AI_TRIGGER_LOGIN }}");
    expect(job(name)).toContain("AI_TRIGGER_USER_ID: ${{ vars.AI_TRIGGER_USER_ID }}");
  }
});

test("verification runs only for planned fixes and publication reads each operation's own receipt", () => {
  expect(job("verify")).toContain("matrix: ${{ fromJSON(needs.prepare.outputs.verify_matrix) }}");
  expect(condition("verify")).toBe("always() && needs.prepare.outputs.has_verification == 'true'");
  expect(job("publish")).not.toContain("needs.verify.result");
});

test("AI automation runs from new PR conversation tags without scheduled recovery state", () => {
  expect(workflow).toContain("issue_comment:\n    types: [created]");
  expect(workflow).not.toContain("schedule:");
  expect(workflow).not.toContain("workflow_dispatch:");
  expect(workflow).not.toContain("AI_STATE_ISSUE");
  expect(workflow).not.toContain("AI_ACTIVATED_AT");
});
