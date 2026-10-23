import type { SchemaIssue } from "aircastle-under-test";
const rejected: SchemaIssue = {
  code: "invalid_editor",
  path: [],
  message: "Invalid editor.",
  expected: "string",
};
void rejected;
