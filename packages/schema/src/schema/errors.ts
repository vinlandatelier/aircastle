import type { IssuePath, NonemptyIssues, SchemaIssue, ValidationIssue } from "./contract.ts";

type Details<Issue> = Issue extends { path: IssuePath; message: string }
  ? Omit<Issue, "path" | "message">
  : never;

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
  invalid_choice: "The value must match one of the declared choices.",
  not_integer: "Expected an integer.",
  too_small: "The number is smaller than the configured minimum.",
  too_large: "The number is larger than the configured maximum.",
  invalid_date: "Expected a calendar date in YYYY-MM-DD format.",
  invalid_datetime: "Expected a date and time with a timezone offset.",
  too_early: "The date is earlier than the configured minimum.",
  too_late: "The date is later than the configured maximum.",
  invalid_list: "Expected a dense list without extra properties.",
  too_few: "The list has fewer items than the configured minimum.",
  too_many: "The list has more items than the configured maximum.",
  invalid_object: "Expected a plain object with enumerable data properties.",
  invalid_reference: "Expected a document id.",
  not_found: "The referenced document does not exist.",
  invalid_block_type: "Expected a block with a declared type.",
  duplicate_id: "This id is already used by an earlier item in the list.",
  invalid_id: "Expected a nonempty id.",
  invalid_json: "Expected a JSON value.",
  invalid_point: "Expected a point with only numeric lat and lng.",
  out_of_range: "The coordinate is outside the allowed range.",
};

export function validationIssue(
  path: IssuePath,
  details: Details<ValidationIssue>,
): ValidationIssue {
  return { ...details, path: [...path], message: validationMessages[details.code] };
}

export function schemaIssue(path: IssuePath, details: Details<SchemaIssue>): SchemaIssue {
  return {
    ...details,
    path: [...path],
    message: `Invalid schema declaration: ${details.code.replaceAll("_", " ")}.`,
  };
}

export class SchemaError extends Error {
  override readonly name = "SchemaError";
  readonly issues: NonemptyIssues<SchemaIssue>;

  constructor(issues: NonemptyIssues<SchemaIssue>) {
    super("The schema contains invalid declarations.");
    this.issues = issues;
  }
}
