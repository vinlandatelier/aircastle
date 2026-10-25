import {
  decodeCollection,
  isPlainRecord,
  type CollectionDescription,
  type CompiledCollection,
  type IssuePath,
  type SchemaError,
} from "@aircastle/schema";

const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;
const reservedCollections = new Set([
  "then",
  "close",
  "constructor",
  "prototype",
  "__proto__",
  "toJSON",
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
      readonly reason: "invalid_collections" | "invalid_entry" | "invalid_name" | "duplicate_name";
      readonly path: IssuePath;
    }
  | {
      readonly reason: "invalid_schema";
      readonly path: IssuePath;
      readonly issues: SchemaError["issues"];
    };
type Decoded<Data> =
  | { readonly ok: true; readonly data: Data }
  | { readonly ok: false; readonly issue: DescriptionIssue };

function rejected(
  reason: Exclude<DescriptionIssue["reason"], "invalid_schema">,
  path: IssuePath,
): { readonly ok: false; readonly issue: DescriptionIssue } {
  return { ok: false, issue: { reason, path } };
}

export function decodeDescription(
  value: unknown,
  path: IssuePath,
): Decoded<CompiledCollection<Record<string, string | null>>> {
  const decoded = decodeCollection(value);
  if (!decoded.ok)
    return { ok: false, issue: { reason: "invalid_schema", path, issues: decoded.issues } };
  const invalid = Object.keys(decoded.collection.describe().fields).find(
    (name) => !fieldName(name),
  );
  if (invalid !== undefined) return rejected("invalid_name", [...path, "fields", invalid]);
  return { ok: true, data: decoded.collection };
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
