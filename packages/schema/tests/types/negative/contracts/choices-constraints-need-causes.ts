import type { SchemaIssue } from "aircastle-under-test";

const rejected: SchemaIssue = {
  code: "invalid_choices",
  path: ["articles", "title"],
  message: "Invalid schema declaration: invalid choices.",
  reason: "violates_constraints",
  index: 0,
};
void rejected;
