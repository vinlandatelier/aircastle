import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "vite-plus/test";

const workflowDirectory = resolve(import.meta.dirname, "../../.github/workflows");
const workflows = readdirSync(workflowDirectory)
  .filter((file) => file.endsWith(".yml"))
  .map((file) => ({ file, text: readFileSync(join(workflowDirectory, file), "utf8") }));
const fetchesPullRequestCode =
  /actions\/checkout|\bgit\s+(clone|fetch|checkout|pull)\b|gh\s+pr\s+checkout/;

const triggerBlock = (text: string) => /^on:\n((?: {2}.*\n)+)/m.exec(text)?.[1];

test("pull_request_target workflows never check out or fetch pull request code", () => {
  const offenders = workflows
    .filter(({ text }) => text.includes("pull_request_target"))
    .filter(({ text }) => fetchesPullRequestCode.test(text))
    .map(({ file }) => file);

  expect(offenders).toEqual([]);
});

test("the approval label workflow runs only when a pull request gets new commits", () => {
  const workflow = workflows.find(({ file }) => file === "approval-label.yml");

  expect(workflow).toBeDefined();
  expect(triggerBlock(workflow?.text ?? "")).toBe(
    "  pull_request_target:\n    types: [synchronize]\n",
  );
});
