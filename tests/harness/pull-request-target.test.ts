import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "vite-plus/test";

const workflowDirectory = resolve(import.meta.dirname, "../../.github/workflows");
const approvalLabelWorkflow = "approval-label.yml";

test("only the approval label workflow runs on pull_request_target", () => {
  const privileged = readdirSync(workflowDirectory)
    .filter((file) => /\.ya?ml$/.test(file))
    .filter((file) =>
      readFileSync(join(workflowDirectory, file), "utf8").includes("pull_request_target"),
    );

  expect(privileged).toEqual([approvalLabelWorkflow]);
});
