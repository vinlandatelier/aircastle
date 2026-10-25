import {
  collection,
  compileSchema,
  isPlainRecord,
  SchemaError,
  text,
  type CollectionDescription,
  type CompiledCollection,
  type IssuePath,
} from "@aircastle/schema";

type FieldIdentity = Parameters<typeof collection>[0][string];
/** The text builder fed unchecked wire values. `compileSchema` validates every modifier value. */
interface WireText extends FieldIdentity {
  min: (value: unknown) => WireText;
  max: (value: unknown) => WireText;
  optional: () => WireText;
  nullable: () => WireText;
  unique: () => WireText;
  default: (value: unknown) => WireText;
  oneOf: (values: unknown) => WireText;
  email: () => WireText;
  url: () => WireText;
  editor: (name: unknown, options: unknown) => WireText;
}
const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;
const reservedCollections = new Set([
  "then",
  "close",
  "constructor",
  "prototype",
  "__proto__",
  "toJSON",
]);
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
function knownKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

export function collectionName(value: unknown): value is string {
  return typeof value === "string" && identifier.test(value) && !reservedCollections.has(value);
}

export function fieldName(value: string): boolean {
  return identifier.test(value) && value !== "id";
}

/** Why a wire description was rejected. The path locates the rejected value inside the input. */
type DescriptionIssue =
  | {
      readonly reason:
        | "invalid_collections"
        | "invalid_entry"
        | "invalid_name"
        | "duplicate_name"
        | "invalid_description"
        | "invalid_field";
      readonly path: IssuePath;
    }
  | { readonly reason: "invalid_schema"; readonly issues: SchemaError["issues"] };
type Decoded<Data> =
  | { readonly ok: true; readonly data: Data }
  | { readonly ok: false; readonly issue: DescriptionIssue };

function rejected(
  reason: Exclude<DescriptionIssue["reason"], "invalid_schema">,
  path: IssuePath,
): { readonly ok: false; readonly issue: DescriptionIssue } {
  return { ok: false, issue: { reason, path } };
}

function wireField(value: unknown, path: IssuePath): Decoded<WireText> {
  if (
    !isPlainRecord(value) ||
    !knownKeys(value, fieldKeys) ||
    value.type !== "text" ||
    typeof value.required !== "boolean" ||
    typeof value.nullable !== "boolean" ||
    typeof value.unique !== "boolean"
  )
    return rejected("invalid_field", path);
  /** The runtime builder stores any modifier value and `compileSchema` validates it, so wire values go in unchecked. */
  let builder = text() as WireText;
  if (!value.required) builder = builder.optional();
  if (value.nullable) builder = builder.nullable();
  if (value.unique) builder = builder.unique();
  for (const constraint of ["min", "max"] as const) {
    if (Object.hasOwn(value, constraint)) builder = builder[constraint](value[constraint]);
  }
  if (Object.hasOwn(value, "choices")) builder = builder.oneOf(value.choices);
  if (Object.hasOwn(value, "format")) {
    if (value.format === "email") builder = builder.email();
    else if (value.format === "url") builder = builder.url();
    else return rejected("invalid_field", [...path, "format"]);
  }
  if (Object.hasOwn(value, "default")) {
    if (value.required) return rejected("invalid_field", [...path, "default"]);
    builder = builder.default(value.default);
  }
  if (Object.hasOwn(value, "editor")) {
    if (!isPlainRecord(value.editor)) return rejected("invalid_field", [...path, "editor"]);
    const { type, ...options } = value.editor;
    if (
      (type === "textarea" && !Object.hasOwn(options, "rows")) ||
      (type === "code" && !Object.hasOwn(options, "language"))
    )
      return rejected("invalid_field", [...path, "editor"]);
    builder = builder.editor(type, options);
  }
  return { ok: true, data: builder };
}

export function decodeDescription(
  value: unknown,
  path: IssuePath,
): Decoded<CompiledCollection<Record<string, string | null>>> {
  if (
    !isPlainRecord(value) ||
    !knownKeys(value, new Set(["fields"])) ||
    !isPlainRecord(value.fields)
  )
    return rejected("invalid_description", path);
  const fields: Record<string, FieldIdentity> = Object.create(null);
  for (const [name, field] of Object.entries(value.fields)) {
    const fieldPath = [...path, "fields", name];
    if (!fieldName(name)) return rejected("invalid_name", fieldPath);
    const decoded = wireField(field, fieldPath);
    if (!decoded.ok) return decoded;
    fields[name] = decoded.data;
  }
  try {
    return { ok: true, data: compileSchema({ wire: collection(fields) }).wire };
  } catch (error) {
    if (!(error instanceof SchemaError)) throw error;
    return { ok: false, issue: { reason: "invalid_schema", issues: error.issues } };
  }
}

/** Decodes published collections from untrusted input and reports why input was rejected. */
export function decodeCollections(
  input: unknown,
): Decoded<{ name: string; description: CollectionDescription }[]> {
  if (!Array.isArray(input)) return rejected("invalid_collections", []);
  const names = new Set<string>();
  const collections: { name: string; description: CollectionDescription }[] = [];
  for (const [index, entry] of input.entries()) {
    if (!isPlainRecord(entry) || !knownKeys(entry, new Set(["name", "description"])))
      return rejected("invalid_entry", [index]);
    if (!collectionName(entry.name)) return rejected("invalid_name", [index, "name"]);
    if (names.has(entry.name)) return rejected("duplicate_name", [index, "name"]);
    names.add(entry.name);
    const decoded = decodeDescription(entry.description, [index, "description"]);
    if (!decoded.ok) return decoded;
    collections.push({ name: entry.name, description: decoded.data.describe() });
  }
  return { ok: true, data: collections };
}
