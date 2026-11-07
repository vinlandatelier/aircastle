import type { CompiledCollection, DecodeResult, IssuePath, SchemaIssue } from "./contract.ts";
import { compiledCollection, compileField } from "./compile.ts";
import type { Modifier } from "./declarations.ts";
import { schemaIssue } from "./errors.ts";
import { isPlainRecord, snapshotChoices, snapshotRecord } from "./records.ts";
import type { TextRules } from "./values.ts";

const fieldKeys = new Set([
  "type",
  "required",
  "nullable",
  "unique",
  "min",
  "max",
  "choices",
  "default",
  "format",
  "editor",
]);

type FieldModifiers =
  | { readonly ok: true; readonly modifiers: readonly Modifier[] }
  | { readonly ok: false; readonly issue: SchemaIssue };

function malformed(path: IssuePath): { readonly ok: false; readonly issue: SchemaIssue } {
  return { ok: false, issue: schemaIssue(path, { code: "invalid_description" }) };
}

function fieldModifiers(value: unknown, path: IssuePath): FieldModifiers {
  if (
    !isPlainRecord(value) ||
    !Object.keys(value).every((key) => fieldKeys.has(key)) ||
    value.type !== "text" ||
    typeof value.required !== "boolean" ||
    typeof value.nullable !== "boolean" ||
    typeof value.unique !== "boolean"
  )
    return malformed(path);
  const modifiers: Modifier[] = [];
  if (!value.required) modifiers.push({ kind: "optional" });
  if (value.nullable) modifiers.push({ kind: "nullable" });
  if (value.unique) modifiers.push({ kind: "unique" });
  for (const kind of ["min", "max"] as const) {
    if (Object.hasOwn(value, kind)) modifiers.push({ kind, value: value[kind] });
  }
  if (Object.hasOwn(value, "choices"))
    modifiers.push({ kind: "choices", value: snapshotChoices(value.choices) });
  if (Object.hasOwn(value, "format")) {
    if (value.format !== "email" && value.format !== "url") return malformed([...path, "format"]);
    modifiers.push({ kind: "format", value: value.format });
  }
  if (Object.hasOwn(value, "default")) {
    if (value.required) return malformed([...path, "default"]);
    modifiers.push({ kind: "default", value: value.default });
  }
  if (Object.hasOwn(value, "editor")) {
    if (!isPlainRecord(value.editor)) return malformed([...path, "editor"]);
    const { type, ...options } = value.editor;
    if (
      (type === "textarea" && !Object.hasOwn(options, "rows")) ||
      (type === "code" && !Object.hasOwn(options, "language"))
    )
      return malformed([...path, "editor"]);
    modifiers.push({ kind: "editor", name: type, options: snapshotRecord(options) });
  }
  return { ok: true, modifiers };
}

/**
 * Compiles a collection from a description in the shape `describe()` emits, read from untrusted input.
 * Issue paths locate the rejected value inside the description. A field with an explicit editor must
 * state every editor option, because a builder default would change the stored contract.
 */
export function decodeCollection(
  description: unknown,
): DecodeResult<CompiledCollection<Record<string, string | null>>> {
  if (
    !isPlainRecord(description) ||
    !Object.keys(description).every((key) => key === "fields") ||
    !isPlainRecord(description.fields)
  )
    return { ok: false, issues: [malformed([]).issue] };
  const issues: SchemaIssue[] = [];
  const fields: [string, TextRules][] = [];
  for (const [name, value] of Object.entries(description.fields)) {
    const decoded = fieldModifiers(value, ["fields", name]);
    if (!decoded.ok) {
      issues.push(decoded.issue);
      continue;
    }
    const compiled = compileField(decoded.modifiers, ["fields", name]);
    issues.push(...compiled.issues);
    fields.push([name, compiled.rules]);
  }
  return issues[0]
    ? { ok: false, issues: [issues[0], ...issues.slice(1)] }
    : { ok: true, data: compiledCollection(fields) };
}
