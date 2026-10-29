import { readFileSync } from "node:fs";
import { expect, test } from "vite-plus/test";

const workflow = readFileSync(".github/workflows/ai.yml", "utf8");
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

test("comment events start planning only for PR comments that mention a bot from an associated author", () => {
  const gate = condition("prepare");
  expect(gate).toContain("github.event_name == 'issue_comment'");
  expect(gate).toContain("github.event.issue.pull_request");
  expect(gate).toContain("contains(github.event.comment.body, '@vinland-ai')");
  expect(gate).not.toContain("@claude");
  expect(gate).not.toContain("@codex");
  expect(gate).toContain(
    `contains(fromJSON('["OWNER", "MEMBER", "COLLABORATOR"]'), github.event.comment.author_association)`,
  );
});

test("verification runs only for planned fixes and publication reads each operation's own receipt", () => {
  expect(job("verify")).toContain("matrix: ${{ fromJSON(needs.prepare.outputs.verify_matrix) }}");
  expect(condition("verify")).toBe("always() && needs.prepare.outputs.has_fixes == 'true'");
  expect(job("publish")).not.toContain("needs.verify.result");
});

test("AI automation runs from new PR conversation tags without scheduled recovery state", () => {
  expect(workflow).toContain("issue_comment:\n    types: [created]");
  expect(workflow).not.toContain("schedule:");
  expect(workflow).not.toContain("workflow_dispatch:");
  expect(workflow).not.toContain("AI_STATE_ISSUE");
  expect(workflow).not.toContain("AI_ACTIVATED_AT");
});
