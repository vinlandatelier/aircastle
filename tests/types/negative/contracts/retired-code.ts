import type { SchemaIssue } from "../../../../src/index.ts";
const rejected: SchemaIssue = { code: "invalid_bounds", path: [], message: "Bad bounds." };
void rejected;
