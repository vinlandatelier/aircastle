import type { SchemaIssue } from "../../../../src/index.ts";
const rejected: SchemaIssue = {
  code: "invalid_default",
  path: [],
  message: "Invalid default.",
  causes: [],
};
void rejected;
