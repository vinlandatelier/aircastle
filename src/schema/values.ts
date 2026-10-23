import { type } from "arktype";
import type { IssuePath, TextEditorDescription, ValidationIssue } from "./contract.ts";
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
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function graphemeLength(value: string): number {
  let count = 0;
  const iterator = segmenter.segment(value)[Symbol.iterator]();
  while (!iterator.next().done) count++;
  return count;
}

export function validateValue(value: unknown, rules: TextRules, path: IssuePath): ValidationIssue[] {
  if (value === null && rules.nullable) return [];
  if (!stringType.allows(value)) return [validationIssue(path, { code: "invalid_type", expected: "string", received: receivedType(value) })];
  const issues: ValidationIssue[] = [];
  if (unpairedSurrogate.test(value)) issues.push(validationIssue(path, { code: "invalid_unicode" }));
  if (value.includes("\u0000")) issues.push(validationIssue(path, { code: "invalid_character" }));
  if (issues.length) return issues;
  if (rules.min !== undefined || rules.max !== undefined) {
    const actual = graphemeLength(value);
    if (rules.min !== undefined && actual < rules.min) issues.push(validationIssue(path, { code: "too_short", minimum: rules.min, actual, unit: "graphemes" }));
    if (rules.max !== undefined && actual > rules.max) issues.push(validationIssue(path, { code: "too_long", maximum: rules.max, actual, unit: "graphemes" }));
  }
  if (rules.format === "email" && !isEmail(value)) issues.push(validationIssue(path, { code: "invalid_email" }));
  if (rules.format === "url" && !isUrl(value)) issues.push(validationIssue(path, { code: "invalid_url" }));
  if (rules.choices && !rules.choices.includes(value)) issues.push(validationIssue(path, { code: "invalid_choice", allowed: [...rules.choices] }));
  return issues;
}
