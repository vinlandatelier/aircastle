import {
  blocks,
  boolean,
  collection,
  compileSchema,
  date,
  datetime,
  isPlainRecord,
  json,
  list,
  number,
  object,
  point,
  reference,
  SchemaError,
  text,
  type CollectionDescription,
  type CollectionDefinitions,
  type CompiledCollection,
  type FieldDescription,
  type IssuePath,
  type JsonValue,
} from "@aircastle/schema";

type FieldIdentity = Parameters<typeof collection>[0][string];
/** A builder fed unchecked wire values. `compileSchema` validates every modifier value. */
interface WireBuilder extends FieldIdentity {
  int: () => WireBuilder;
  min: (value: unknown) => WireBuilder;
  max: (value: unknown) => WireBuilder;
  optional: () => WireBuilder;
  nullable: () => WireBuilder;
  unique: () => WireBuilder;
  default: (value: unknown) => WireBuilder;
  oneOf: (values: unknown) => WireBuilder;
  email: () => WireBuilder;
  url: () => WireBuilder;
  editor: (name: unknown, options?: unknown) => WireBuilder;
}
function wire(builder: unknown): WireBuilder {
  return builder as WireBuilder;
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
type Kind = FieldDescription["type"];
const keys = (...extra: string[]): ReadonlySet<string> =>
  new Set(["type", "required", "nullable", ...extra]);
const kindKeys = {
  text: keys("unique", "min", "max", "choices", "default", "format", "editor"),
  number: keys("integer", "min", "max", "default"),
  boolean: keys("default", "editor"),
  date: keys("min", "max", "default"),
  datetime: keys("min", "max", "default"),
  list: keys("item", "min", "max", "default"),
  object: keys("fields", "default"),
  blocks: keys("variants", "min", "max", "default"),
  json: keys("default"),
  point: keys("default"),
  reference: keys("collection", "collections"),
} satisfies Record<Kind, ReadonlySet<string>>;
function isKind(value: unknown): value is Kind {
  return typeof value === "string" && Object.hasOwn(kindKeys, value);
}
function unreachable(kind: never): never {
  throw new TypeError(`Unhandled field kind ${String(kind)}`);
}
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

interface ReferenceTarget {
  readonly name: string;
  readonly path: IssuePath;
}
type Position = "field" | "item" | "variant";

function invalidField(path: IssuePath, ...rest: (string | number)[]) {
  return rejected("invalid_field", [...path, ...rest]);
}

function presence(builder: WireBuilder, value: Record<string, unknown>): WireBuilder {
  let result = builder;
  if (!value.required) result = result.optional();
  if (value.nullable) result = result.nullable();
  return result;
}

function bounded(builder: WireBuilder, value: Record<string, unknown>): WireBuilder {
  let result = builder;
  for (const constraint of ["min", "max"] as const) {
    if (Object.hasOwn(value, constraint)) result = result[constraint](value[constraint]);
  }
  return result;
}

function withDefault(
  builder: WireBuilder,
  value: Record<string, unknown>,
  path: IssuePath,
): Decoded<WireBuilder> {
  if (!Object.hasOwn(value, "default")) return { ok: true, data: builder };
  if (value.required) return invalidField(path, "default");
  return { ok: true, data: builder.default(value.default) };
}

function decodeText(value: Record<string, unknown>, path: IssuePath): Decoded<WireBuilder> {
  if (typeof value.unique !== "boolean") return invalidField(path);
  let builder = presence(wire(text()), value);
  if (value.unique) builder = builder.unique();
  builder = bounded(builder, value);
  if (Object.hasOwn(value, "choices")) builder = builder.oneOf(value.choices);
  if (Object.hasOwn(value, "format")) {
    if (value.format === "email") builder = builder.email();
    else if (value.format === "url") builder = builder.url();
    else return invalidField(path, "format");
  }
  const defaulted = withDefault(builder, value, path);
  if (!defaulted.ok || !Object.hasOwn(value, "editor")) return defaulted;
  if (!isPlainRecord(value.editor)) return invalidField(path, "editor");
  const { type, ...options } = value.editor;
  if (
    (type === "textarea" && !Object.hasOwn(options, "rows")) ||
    (type === "code" && !Object.hasOwn(options, "language"))
  )
    return invalidField(path, "editor");
  return { ok: true, data: defaulted.data.editor(type, options) };
}

function decodeBoolean(value: Record<string, unknown>, path: IssuePath): Decoded<WireBuilder> {
  const builder = presence(wire(boolean()), value);
  if (!Object.hasOwn(value, "editor")) return withDefault(builder, value, path);
  const editor = value.editor;
  if (!isPlainRecord(editor) || Object.keys(editor).length !== 1 || editor.type !== "switch")
    return invalidField(path, "editor");
  return withDefault(builder.editor("switch"), value, path);
}

function decodeReference(
  value: Record<string, unknown>,
  path: IssuePath,
  targets: ReferenceTarget[],
): Decoded<WireBuilder> {
  const hasSingle = Object.hasOwn(value, "collection");
  if (hasSingle === Object.hasOwn(value, "collections")) return invalidField(path);
  if (hasSingle) {
    if (typeof value.collection !== "string") return invalidField(path, "collection");
    targets.push({ name: value.collection, path: [...path, "collection"] });
    return { ok: true, data: presence(wire(reference(value.collection)), value) };
  }
  const names = value.collections;
  if (
    !Array.isArray(names) ||
    names.length === 0 ||
    !names.every((name) => typeof name === "string") ||
    new Set(names).size !== names.length
  )
    return invalidField(path, "collections");
  names.forEach((name, index) => targets.push({ name, path: [...path, "collections", index] }));
  return {
    ok: true,
    data: presence(wire(reference(names as [string, ...string[]])), value),
  };
}

function decodeMap(
  value: unknown,
  path: IssuePath,
  position: Position,
  targets: ReferenceTarget[],
): Decoded<Record<string, WireBuilder>> {
  if (!isPlainRecord(value)) return invalidField(path);
  const members: Record<string, WireBuilder> = Object.create(null);
  for (const [name, member] of Object.entries(value)) {
    const memberPath = [...path, name];
    if (!identifier.test(name)) return rejected("invalid_name", memberPath);
    const decoded = decodeField(member, memberPath, position, targets);
    if (!decoded.ok) return decoded;
    members[name] = decoded.data;
  }
  return { ok: true, data: members };
}

function decodeField(
  value: unknown,
  path: IssuePath,
  position: Position,
  targets: ReferenceTarget[],
): Decoded<WireBuilder> {
  if (
    !isPlainRecord(value) ||
    !isKind(value.type) ||
    !knownKeys(value, kindKeys[value.type]) ||
    typeof value.required !== "boolean" ||
    typeof value.nullable !== "boolean" ||
    (position !== "field" && !value.required) ||
    (position === "variant" && (value.nullable || value.type !== "object"))
  )
    return invalidField(path);
  const kind: Kind = value.type;
  switch (kind) {
    case "text":
      return decodeText(value, path);
    case "boolean":
      return decodeBoolean(value, path);
    case "number": {
      if (typeof value.integer !== "boolean") return invalidField(path);
      const base = presence(wire(number()), value);
      return withDefault(bounded(value.integer ? base.int() : base, value), value, path);
    }
    case "date":
    case "datetime": {
      const base = wire(kind === "date" ? date() : datetime());
      return withDefault(bounded(presence(base, value), value), value, path);
    }
    case "json":
      return withDefault(presence(wire(json()), value), value, path);
    case "point":
      return withDefault(presence(wire(point()), value), value, path);
    case "reference":
      return decodeReference(value, path, targets);
    case "list": {
      const item = decodeField(value.item, [...path, "item"], "item", targets);
      if (!item.ok) return item;
      return withDefault(bounded(presence(wire(list(item.data)), value), value), value, path);
    }
    case "object": {
      const fields = decodeMap(value.fields, [...path, "fields"], "field", targets);
      if (!fields.ok) return fields;
      return withDefault(presence(wire(object(fields.data)), value), value, path);
    }
    case "blocks": {
      const variants = decodeMap(value.variants, [...path, "variants"], "variant", targets);
      if (!variants.ok) return variants;
      if (Object.keys(variants.data).length === 0) return invalidField(path, "variants");
      const base = wire(blocks(variants.data as unknown as Parameters<typeof blocks>[0]));
      return withDefault(bounded(presence(base, value), value), value, path);
    }
    default:
      return unreachable(kind);
  }
}

interface DecodedEntry {
  readonly compiled: CompiledCollection<Record<string, JsonValue>>;
  readonly targets: readonly ReferenceTarget[];
}

const entryName = "wire";

function decodeEntry(value: unknown, path: IssuePath): Decoded<DecodedEntry> {
  if (
    !isPlainRecord(value) ||
    !knownKeys(value, new Set(["fields"])) ||
    !isPlainRecord(value.fields)
  )
    return rejected("invalid_description", path);
  const fields: Record<string, WireBuilder> = Object.create(null);
  const targets: ReferenceTarget[] = [];
  for (const [name, field] of Object.entries(value.fields)) {
    const fieldPath = [...path, "fields", name];
    if (!fieldName(name)) return rejected("invalid_name", fieldPath);
    const decoded = decodeField(field, fieldPath, "field", targets);
    if (!decoded.ok) return decoded;
    fields[name] = decoded.data;
  }
  const definitions: Record<string, CollectionDefinitions[string]> = Object.create(null);
  definitions[entryName] = collection(fields);
  for (const { name } of targets) {
    if (name !== entryName && collectionName(name)) definitions[name] = collection({});
  }
  try {
    const compiled = compileSchema(definitions)[entryName] as CompiledCollection<
      Record<string, JsonValue>
    >;
    return { ok: true, data: { compiled, targets } };
  } catch (error) {
    if (!(error instanceof SchemaError)) throw error;
    return { ok: false, issue: { reason: "invalid_schema", issues: error.issues } };
  }
}

export function decodeDescription(
  value: unknown,
  path: IssuePath,
): Decoded<CompiledCollection<Record<string, JsonValue>>> {
  const decoded = decodeEntry(value, path);
  return decoded.ok ? { ok: true, data: decoded.data.compiled } : decoded;
}

/** Decodes published collections from untrusted input and reports why input was rejected. */
export function decodeCollections(
  input: unknown,
): Decoded<{ name: string; description: CollectionDescription }[]> {
  if (!Array.isArray(input)) return rejected("invalid_collections", []);
  const names = new Set<string>();
  const collections: { name: string; description: CollectionDescription }[] = [];
  const targets: ReferenceTarget[] = [];
  for (const [index, entry] of input.entries()) {
    if (!isPlainRecord(entry) || !knownKeys(entry, new Set(["name", "description"])))
      return rejected("invalid_entry", [index]);
    if (!collectionName(entry.name)) return rejected("invalid_name", [index, "name"]);
    if (names.has(entry.name)) return rejected("duplicate_name", [index, "name"]);
    names.add(entry.name);
    const decoded = decodeEntry(entry.description, [index, "description"]);
    if (!decoded.ok) return decoded;
    targets.push(...decoded.data.targets);
    collections.push({ name: entry.name, description: decoded.data.compiled.describe() });
  }
  const unknown = targets.find((target) => !names.has(target.name));
  return unknown ? rejected("invalid_field", unknown.path) : { ok: true, data: collections };
}
