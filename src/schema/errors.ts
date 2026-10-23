import type { IssuePath, SchemaError as SchemaErrorContract, SchemaIssue, ValidationIssue } from "./contract.ts";

type Details<Issue> = Issue extends { path: IssuePath; message: string } ? Omit<Issue, "path" | "message"> : never;

const validationMessages: Record<ValidationIssue["code"], string> = {
  required: "This field is required.",
  invalid_document: "Expected a plain document with enumerable data properties.",
  invalid_unicode: "Text contains an unpaired Unicode surrogate.",
  invalid_character: "Text contains a forbidden NUL character.",
  invalid_email: "Expected an email address in the supported format.",
  invalid_url: "Expected an absolute HTTP or HTTPS URL in the supported format.",
  unknown_field: "This field is not declared in the collection.",
  invalid_type: "Expected a text value.",
  too_short: "Text is shorter than the configured minimum.",
  too_long: "Text is longer than the configured maximum.",
  invalid_choice: "Text must match one of the declared choices.",
};

export function validationIssue(path: IssuePath, details: Details<ValidationIssue>): ValidationIssue {
  return { ...details, path: [...path], message: validationMessages[details.code] };
}

export function schemaIssue(path: IssuePath, details: Details<SchemaIssue>): SchemaIssue {
  return { ...details, path: [...path], message: `Invalid schema declaration: ${details.code.replaceAll("_", " ")}.` };
}

export class SchemaError extends Error implements SchemaErrorContract {
  override readonly name = "SchemaError";
  readonly issues: SchemaErrorContract["issues"];

  constructor(issues: SchemaErrorContract["issues"]) {
    super("The schema contains invalid declarations.");
    this.issues = issues;
  }
}
