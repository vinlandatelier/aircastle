import type { ValidationResult } from "aircastle-under-test";
const rejected: ValidationResult<{ title: string }> = { ok: false, issues: [] };
void rejected;
