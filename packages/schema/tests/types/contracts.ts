import type {
  CompiledCollection,
  CompiledSchema,
  ExpectedType,
  SchemaIssue,
  ValidationIssue,
  ValidationResult,
} from "aircastle-under-test";
import type { Assert, Equal } from "./assert.ts";

export type ValidationCodes = Assert<
  Equal<
    ValidationIssue["code"],
    | "required"
    | "invalid_document"
    | "invalid_unicode"
    | "invalid_character"
    | "invalid_email"
    | "invalid_url"
    | "unknown_field"
    | "invalid_type"
    | "too_short"
    | "too_long"
    | "invalid_choice"
    | "not_integer"
    | "too_small"
    | "too_large"
    | "invalid_date"
    | "invalid_datetime"
    | "too_early"
    | "too_late"
    | "invalid_list"
    | "too_few"
    | "too_many"
    | "invalid_object"
    | "invalid_reference"
    | "not_found"
    | "invalid_block_type"
    | "invalid_id"
    | "duplicate_id"
    | "invalid_json"
    | "invalid_point"
    | "out_of_range"
  >
>;

export type SchemaCodes = Assert<
  Equal<
    SchemaIssue["code"],
    | "invalid_definition"
    | "conflicting_defaults"
    | "conflicting_formats"
    | "conflicting_choices"
    | "conflicting_editors"
    | "invalid_bound"
    | "conflicting_bounds"
    | "invalid_default"
    | "invalid_choices"
    | "duplicate_choice"
    | "invalid_editor"
    | "unknown_editor"
    | "invalid_editor_options"
    | "incompatible_editor"
    | "invalid_item"
    | "invalid_blocks"
    | "unknown_collection"
    | "invalid_references"
    | "unsupported_unique"
  >
>;

export type ExpectedTypes = Assert<
  Equal<ExpectedType, "string" | "number" | "boolean" | "array" | "object" | "json">
>;

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

const invalidDefinition: SchemaIssue = {
  code: "invalid_definition",
  path: [],
  message: "Expected a record.",
  expected: "record",
  received: "array",
};
const invalidEditor: SchemaIssue = {
  code: "invalid_editor",
  path: ["articles", "title"],
  message: "Expected an editor name.",
  expected: "string",
  received: "number",
};
void [invalidDefinition, invalidEditor];
