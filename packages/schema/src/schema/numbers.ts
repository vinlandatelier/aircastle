import type { IssuePath, ValidationIssue } from "./contract.ts";
import { validationIssue } from "./errors.ts";
import type { NumberRules, Outcome } from "./fields.ts";
import { receivedType } from "./records.ts";

/** Postgres JSONB stores `-0` as `0`, so validated output uses `0` to round-trip unchanged. */
export function withoutNegativeZero(value: number): number {
  return value === 0 ? 0 : value;
}

export function validateNumber(value: unknown, rules: NumberRules, path: IssuePath): Outcome {
  if (typeof value !== "number" || !Number.isFinite(value))
    return {
      ok: false,
      issues: [
        validationIssue(path, {
          code: "invalid_type",
          expected: "number",
          received: receivedType(value),
        }),
      ],
    };
  const issues: ValidationIssue[] = [];
  if (rules.integer && !Number.isSafeInteger(value))
    issues.push(validationIssue(path, { code: "not_integer" }));
  if (rules.min !== undefined && value < rules.min)
    issues.push(validationIssue(path, { code: "too_small", minimum: rules.min, actual: value }));
  if (rules.max !== undefined && value > rules.max)
    issues.push(validationIssue(path, { code: "too_large", maximum: rules.max, actual: value }));
  return issues.length ? { ok: false, issues } : { ok: true, value: withoutNegativeZero(value) };
}
