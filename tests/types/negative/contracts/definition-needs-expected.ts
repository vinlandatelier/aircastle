import type { SchemaIssue } from "aircastle-under-test";
const rejected: SchemaIssue = { code: "invalid_definition", path: [], message: "Invalid definition.", received: "object" };
void rejected;
