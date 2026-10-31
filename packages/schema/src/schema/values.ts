import { type } from "arktype";
import type { IssuePath, ValidationIssue } from "./contract.ts";
import { validationIssue } from "./errors.ts";
import type { TextRules } from "./fields.ts";
import { isEmail, isUrl } from "./formats.ts";
import { receivedType } from "./records.ts";

const stringType = type("string");
const unpairedSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const segmenter = new Intl.Segmenter();

function graphemeLength(value: string): number {
  let count = 0;
  const iterator = segmenter.segment(value)[Symbol.iterator]();
  while (!iterator.next().done) count++;
  return count;
}

/** The Unicode integrity issues of a string: unpaired surrogates, then NUL. Both can apply. */
export function integrityIssues(value: string, path: IssuePath): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (unpairedSurrogate.test(value))
    issues.push(validationIssue(path, { code: "invalid_unicode" }));
  if (value.includes("\u0000")) issues.push(validationIssue(path, { code: "invalid_character" }));
  return issues;
}

export function validateText(value: unknown, rules: TextRules, path: IssuePath): ValidationIssue[] {
  if (!stringType.allows(value))
    return [
      validationIssue(path, {
        code: "invalid_type",
        expected: "string",
        received: receivedType(value),
      }),
    ];
  const issues = integrityIssues(value, path);
  if (issues.length) return issues;
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
  return issues;
}
