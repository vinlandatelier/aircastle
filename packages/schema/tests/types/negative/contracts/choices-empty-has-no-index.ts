import type { SchemaIssue } from "aircastle-under-test";

const rejected: SchemaIssue = {
  code: "invalid_choices",
  path: ["articles", "title"],
  message: "Invalid schema declaration: invalid choices.",
  reason: "empty",
  index: 3,
};
void rejected;
