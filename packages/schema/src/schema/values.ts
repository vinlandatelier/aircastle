import { type } from "arktype";
import type {
  IssuePath,
  NonemptyIssues,
  TextEditorDescription,
  ValidationIssue,
} from "./contract.ts";
import { validationIssue } from "./errors.ts";
import { isEmail, isUrl } from "./formats.ts";
import { receivedType } from "./records.ts";

export interface TextRules {
  readonly optional: boolean;
  readonly nullable: boolean;
  readonly unique: boolean;
  readonly min?: number;
  readonly max?: number;
  readonly format?: "email" | "url";
  readonly choices?: readonly string[];
  readonly default?: string | null;
  readonly editor?: TextEditorDescription;
}

const stringType = type("string");
const unpairedSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const segmenter = new Intl.Segmenter();

function graphemeLength(value: string): number {
  let count = 0;
  const iterator = segmenter.segment(value)[Symbol.iterator]();
  while (!iterator.next().done) count++;
  return count;
}

type CheckedValue =
  | { readonly ok: true; readonly value: string | null }
  | { readonly ok: false; readonly issues: NonemptyIssues<ValidationIssue> };

export function validateValue(value: unknown, rules: TextRules, path: IssuePath): CheckedValue {
  if (value === null && rules.nullable) return { ok: true, value };
  if (!stringType.allows(value))
    return {
      ok: false,
      issues: [
        validationIssue(path, {
          code: "invalid_type",
          expected: "string",
          received: receivedType(value),
        }),
      ],
    };
  const issues: ValidationIssue[] = [];
  if (unpairedSurrogate.test(value))
    issues.push(validationIssue(path, { code: "invalid_unicode" }));
  if (value.includes("\u0000")) issues.push(validationIssue(path, { code: "invalid_character" }));
  if (issues[0]) return { ok: false, issues: [issues[0], ...issues.slice(1)] };
  if (rules.min !== undefined || rules.max !== undefined) {
    const actual = graphemeLength(value);
    const { min = 0, max = Infinity } = rules;
    if (actual < min)
      issues.push(
        validationIssue(path, { code: "too_short", minimum: min, actual, unit: "graphemes" }),
      );
    if (actual > max)
      issues.push(
        validationIssue(path, { code: "too_long", maximum: max, actual, unit: "graphemes" }),
      );
  }
  if (rules.format === "email" && !isEmail(value))
    issues.push(validationIssue(path, { code: "invalid_email" }));
  if (rules.format === "url" && !isUrl(value))
    issues.push(validationIssue(path, { code: "invalid_url" }));
  if (rules.choices && !rules.choices.includes(value))
    issues.push(validationIssue(path, { code: "invalid_choice", allowed: [...rules.choices] }));
  return issues[0] ? { ok: false, issues: [issues[0], ...issues.slice(1)] } : { ok: true, value };
}
