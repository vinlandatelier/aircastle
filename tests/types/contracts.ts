import type { CollectionDescription, CompiledCollection, CompiledSchema, SchemaIssue, ValidationIssue, ValidationResult } from "../../src/index.ts";
import type { Assert, Equal } from "./assert.ts";

export type ValidationCodes = Assert<Equal<ValidationIssue["code"],
  "required" | "invalid_document" | "invalid_unicode" | "invalid_character" |
  "invalid_email" | "invalid_url" | "unknown_field" | "invalid_type" |
  "too_short" | "too_long" | "invalid_choice"
>>;

declare const result: ValidationResult<{ title: string }>;
if (result.ok) {
  const title: string = result.data.title;
  void title;
  // @ts-expect-error Success has no issues member.
  result.issues;
} else {
  const first: ValidationIssue = result.issues[0];
  void first;
  // @ts-expect-error Failure exposes no partial data.
  result.data;
}

// @ts-expect-error Failures must contain at least one issue.
const emptyFailure: ValidationResult<{ title: string }> = { ok: false, issues: [] };
void emptyFailure;
// @ts-expect-error An invalid default must include nonempty validation causes.
const emptyCauses: SchemaIssue = { code: "invalid_default", path: ["articles", "title"], message: "Invalid default.", causes: [] };
void emptyCauses;
// @ts-expect-error The retired contradictory-range code is not accepted.
const legacyCode: SchemaIssue = { code: "invalid_bounds", path: [], message: "Bad bounds." };
void legacyCode;

declare const description: CollectionDescription;
// @ts-expect-error Field descriptions are read-only.
description.fields.title = { type: "text", required: true, nullable: false, unique: false };
if (description.fields.title) {
  // @ts-expect-error Field metadata is read-only.
  description.fields.title.required = false;
}

declare const schema: CompiledSchema<{ articles: { title: string } }>;
const collection: CompiledCollection<{ title: string }> = schema.articles;
collection.validate(Symbol("unknown input is allowed"));
// @ts-expect-error Compiled collection keys come from the schema declaration.
schema.pages;
// @ts-expect-error Compiled schema members are read-only.
schema.articles = collection;
