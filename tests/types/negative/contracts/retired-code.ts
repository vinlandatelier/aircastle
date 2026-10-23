import type { SchemaIssue } from "aircastle-under-test";
const rejected: SchemaIssue = { code: "invalid_bounds", path: [], message: "Bad bounds." };
void rejected;
