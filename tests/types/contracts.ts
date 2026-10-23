import type { CompiledCollection, CompiledSchema, ValidationIssue, ValidationResult } from "aircastle-under-test";
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
} else {
  const first: ValidationIssue = result.issues[0];
  void first;
}

declare const schema: CompiledSchema<{ articles: { title: string } }>;
const collection: CompiledCollection<{ title: string }> = schema.articles;
collection.validate(Symbol("unknown input is allowed"));
