import type { ValidationResult } from "aircastle-under-test";
declare const result: Extract<ValidationResult<{ title: string }>, { ok: false }>;
result.data;
