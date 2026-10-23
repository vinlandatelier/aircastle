import type { SchemaIssue } from "aircastle-under-test";
const rejected: SchemaIssue = { code: "invalid_default", path: [], message: "Invalid default.", causes: [] };
void rejected;
