import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "vite-plus/test";

const workflowDirectory = resolve(import.meta.dirname, "../../.github/workflows");
const workflows = readdirSync(workflowDirectory)
  .filter((file) => /\.ya?ml$/.test(file))
  .map((file) => ({ file, text: readFileSync(join(workflowDirectory, file), "utf8") }));

const approvalLabelWorkflow = "approval-label.yml";
const approvedRunScripts = [
  [
    "|",
    'if output=$(gh api --method DELETE "repos/$REPOSITORY/issues/$PR_NUMBER/labels/ready-for-human-approval" 2>&1); then',
    "exit 0",
    "fi",
    'case "$output" in',
    '*"HTTP 404"*) echo "The label was already removed." ;;',
    '*) echo "$output" >&2; exit 1 ;;',
    "esac",
  ],
];

const indentation = (line: string) => line.length - line.trimStart().length;

const runScripts = (text: string) => {
  const lines = text.split("\n");
  return lines.flatMap((line, index) => {
    const match = /^(\s*(?:-\s+)?)run:\s*(.*)$/.exec(line);
    if (!match) return [];
    const keyIndentation = match[1]?.length ?? 0;
    const following = lines.slice(index + 1);
    const end = following.findIndex(
      (next) => next.trim() !== "" && indentation(next) <= keyIndentation,
    );
    const block = end === -1 ? following : following.slice(0, end);
    return [[match[2] ?? "", ...block].map((part) => part.trim()).filter((part) => part !== "")];
  });
};

const approvalLabel = workflows.find(({ file }) => file === approvalLabelWorkflow)?.text ?? "";

test("only the approval label workflow runs on pull_request_target", () => {
  const privileged = workflows
    .filter(({ text }) => text.includes("pull_request_target"))
    .map(({ file }) => file);

  expect(privileged).toEqual([approvalLabelWorkflow]);
});

test("the approval label workflow calls no actions or reusable workflows", () => {
  expect(approvalLabel).not.toMatch(/\buses\s*:/);
});

test("the approval label workflow runs only approved scripts without expressions", () => {
  const scripts = runScripts(approvalLabel);

  expect(scripts.filter((script) => script.join("\n").includes("${{"))).toEqual([]);
  expect(scripts).toEqual(approvedRunScripts);
});
