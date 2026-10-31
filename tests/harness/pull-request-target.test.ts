import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "vite-plus/test";

const workflowDirectory = resolve(import.meta.dirname, "../../.github/workflows");
const approvalLabelWorkflow = "approval-label.yml";
const approvedApprovalLabelWorkflow = [
  "name: Clear stale approval label",
  "on:",
  "  pull_request_target:",
  "    types: [synchronize, reopened]",
  "permissions: {}",
  "concurrency: approval-label-${{ github.event.pull_request.number }}",
  "jobs:",
  "  clear:",
  "    if: contains(github.event.pull_request.labels.*.name, 'ready-for-human-approval')",
  "    runs-on: ubuntu-24.04",
  "    timeout-minutes: 5",
  "    permissions:",
  "      pull-requests: write",
  "    steps:",
  "      - name: Remove ready-for-human-approval from the new head",
  "        env:",
  "          GH_TOKEN: ${{ github.token }}",
  "          REPOSITORY: ${{ github.repository }}",
  "          PR_NUMBER: ${{ github.event.pull_request.number }}",
  "        run: |",
  '          if output=$(gh api --method DELETE "repos/$REPOSITORY/issues/$PR_NUMBER/labels/ready-for-human-approval" 2>&1); then',
  "            exit 0",
  "          fi",
  '          case "$output" in',
  '            *"HTTP 404"*) echo "The label was already removed." ;;',
  '            *) echo "$output" >&2; exit 1 ;;',
  "          esac",
  "",
].join("\n");

test("only the approval label workflow runs on pull_request_target", () => {
  const privileged = readdirSync(workflowDirectory)
    .filter((file) => /\.ya?ml$/.test(file))
    .filter((file) =>
      readFileSync(join(workflowDirectory, file), "utf8").includes("pull_request_target"),
    );

  expect(privileged).toEqual([approvalLabelWorkflow]);
});

test("the approval label workflow matches the reviewed text exactly", () => {
  const workflow = readFileSync(join(workflowDirectory, approvalLabelWorkflow), "utf8");

  expect(workflow).toBe(approvedApprovalLabelWorkflow);
});
