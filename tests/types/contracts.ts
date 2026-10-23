import type {
  CompiledCollection,
  CompiledSchema,
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
  >
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
