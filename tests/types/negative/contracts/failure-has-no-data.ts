import type { ValidationResult } from "../../../../src/index.ts";
declare const result: Extract<ValidationResult<{ title: string }>, { ok: false }>;
result.data;
