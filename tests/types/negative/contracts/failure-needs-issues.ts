import type { ValidationResult } from "../../../../src/index.ts";
const rejected: ValidationResult<{ title: string }> = { ok: false, issues: [] };
void rejected;
