import {
  compileSchema,
  isMember,
  isPlainRecord,
  SchemaError,
  type CollectionDefinitions,
  type CollectionDescription,
  type CompiledCollection,
  type ExpectedType,
  type FieldDescription,
  type JsonValue,
  type ValidationIssue,
  type ReceivedType,
} from "@aircastle/schema";
import { collectionName, decodeCollections, decodeDescription, fieldName } from "./decode.ts";

export type { CollectionDescription, CollectionDefinitions } from "@aircastle/schema";
export type DocumentData = Record<string, JsonValue>;
export type ContentDocument = DocumentData & { id: string };
export type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export type Permission = "content:read" | "content:write" | "schema:publish";
export type ContentError =
  | { code: "validation_failed"; issues: readonly [ValidationIssue, ...ValidationIssue[]] }
  | { code: "unique_conflict"; field: string }
  | {
      code:
        | "invalid_request"
        | "unauthorized"
        | "forbidden"
        | "not_found"
        | "schema_mismatch"
        | "schema_conflict"
        | "migration_required"
        | "payload_too_large"
        | "internal_error"
        | "unavailable"
        | "transport_error"
        | "unknown_write_outcome";
    };
export type Result<Data> = { ok: true; data: Data } | { ok: false; error: ContentError };
export interface PublishedCollection {
  name: string;
  description: CollectionDescription;
}
export interface ProjectState {
  revision: string | null;
  collections: readonly PublishedCollection[];
}
export interface Publication {
  revision: string;
  contracts: Readonly<Record<string, string>>;
}
export interface Lockfile {
  format: 1;
  target: { url: string; project: string };
  revision: string;
}

/** Issue codes whose issues carry no details beyond `code`, `path` and `message`. */
type PlainIssueCode = {
  [Code in ValidationIssue["code"]]: Exclude<
    keyof Extract<ValidationIssue, { code: Code }>,
    "code" | "path" | "message"
  > extends never
    ? Code
    : never;
}[ValidationIssue["code"]];
type PlainErrorCode = Exclude<ContentError["code"], "validation_failed" | "unique_conflict">;

/** Self-keyed so a wrong value rejects its name; `Record<Union, true>` values are never read. */
const plainIssueCodes = {
  required: "required",
  invalid_document: "invalid_document",
  invalid_unicode: "invalid_unicode",
  invalid_character: "invalid_character",
  invalid_email: "invalid_email",
  invalid_url: "invalid_url",
  unknown_field: "unknown_field",
  not_integer: "not_integer",
  invalid_date: "invalid_date",
  invalid_datetime: "invalid_datetime",
  invalid_list: "invalid_list",
  invalid_object: "invalid_object",
  invalid_reference: "invalid_reference",
  invalid_id: "invalid_id",
  invalid_json: "invalid_json",
  invalid_point: "invalid_point",
} as const satisfies { [Name in PlainIssueCode]: Name };
/** Self-keyed so a wrong value rejects its name; `Record<Union, true>` values are never read. */
const expectedTypes = {
  string: "string",
  number: "number",
  boolean: "boolean",
  array: "array",
  object: "object",
  json: "json",
} satisfies { [Name in ExpectedType]: Name };
/** Self-keyed so a wrong value rejects its name; `Record<Union, true>` values are never read. */
const receivedTypes = {
  string: "string",
  number: "number",
  boolean: "boolean",
  null: "null",
  undefined: "undefined",
  array: "array",
  object: "object",
  bigint: "bigint",
  symbol: "symbol",
  function: "function",
} satisfies { [Name in ReceivedType]: Name };
/** Self-keyed so a wrong value rejects its name; `Record<Union, true>` values are never read. */
const plainErrorCodes = {
  invalid_request: "invalid_request",
  unauthorized: "unauthorized",
  forbidden: "forbidden",
  not_found: "not_found",
  schema_mismatch: "schema_mismatch",
  schema_conflict: "schema_conflict",
  migration_required: "migration_required",
  payload_too_large: "payload_too_large",
  internal_error: "internal_error",
  unavailable: "unavailable",
  transport_error: "transport_error",
  unknown_write_outcome: "unknown_write_outcome",
} satisfies { [Name in PlainErrorCode]: Name };

function isCount(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function names(value: unknown): string[] | undefined {
  return Array.isArray(value) &&
    value.length > 0 &&
    value.every((entry: unknown) => typeof entry === "string")
    ? [...value]
    : undefined;
}

export function describeCollections(definitions: CollectionDefinitions): PublishedCollection[] {
  const compiled = compileSchema(definitions);
  return Object.entries(compiled).map(([name, definition]) => {
    const description = definition.describe();
    if (!collectionName(name) || !Object.keys(description.fields).every(fieldName))
      throw new TypeError("Invalid collection description");
    return { name, description };
  });
}

export function parseCollections(input: unknown): Result<PublishedCollection[]> {
  const decoded = decodeCollections(input);
  return decoded.ok ? decoded : { ok: false, error: { code: "invalid_request" } };
}

export function compileDescription(
  description: CollectionDescription,
): CompiledCollection<DocumentData> {
  const decoded = decodeDescription(description, []);
  if (decoded.ok) return decoded.data;
  if (decoded.issue.reason === "invalid_schema") throw new SchemaError(decoded.issue.issues);
  throw new TypeError("Invalid collection description", { cause: decoded.issue });
}

type Fields = Readonly<Record<string, FieldDescription>>;
type PlainRecord = Readonly<Record<string, unknown>>;
type Path = (string | number)[];
type BlocksDescription = Extract<FieldDescription, { type: "blocks" }>;

function canonical(value: unknown): string {
  const sorted = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(sorted);
    if (entry !== null && typeof entry === "object") {
      return Object.fromEntries(
        Object.keys(entry)
          .sort()
          .map((key) => [key, sorted(Reflect.get(entry, key))]),
      );
    }
    return entry;
  };
  return JSON.stringify(sorted(value));
}

function mapFields(fields: Fields, transform: (field: FieldDescription) => unknown) {
  return Object.fromEntries(
    Object.entries(fields).map(([name, field]) => [name, transform(field)]),
  );
}

function fieldOrder(fields: Fields): unknown {
  return Object.entries(fields).map(([name, field]) => {
    if (field.type === "object") return [name, fieldOrder(field.fields)];
    if (field.type === "list") return [name, fieldOrder({ item: field.item })];
    if (field.type === "blocks") return [name, fieldOrder(field.variants)];
    return [name];
  });
}

export function sameSchema(
  left: readonly PublishedCollection[],
  right: readonly PublishedCollection[],
): boolean {
  return (
    left.length === right.length &&
    left.every((entry, index) => {
      const other = right[index]!;
      return (
        entry.name === other.name &&
        JSON.stringify(fieldOrder(entry.description.fields)) ===
          JSON.stringify(fieldOrder(other.description.fields)) &&
        canonical(entry.description) === canonical(other.description)
      );
    })
  );
}

function withoutEditors(field: FieldDescription): unknown {
  const rest = Object.fromEntries(Object.entries(field).filter(([key]) => key !== "editor"));
  if (field.type === "object") return { ...rest, fields: mapFields(field.fields, withoutEditors) };
  if (field.type === "list") return { ...rest, item: withoutEditors(field.item) };
  if (field.type === "blocks")
    return { ...rest, variants: mapFields(field.variants, withoutEditors) };
  return rest;
}

export function canonicalContract(description: CollectionDescription): string {
  return canonical({ fields: mapFields(description.fields, withoutEditors) });
}

export async function contractId(description: CollectionDescription): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalContract(description));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return (
    "v1:" +
    Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("")
  );
}

/** Deep equality for JSON values that ignores object key order and tells `undefined` from absent keys. */
function sameJson(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((entry, index) => sameJson(entry, right[index]))
    );
  }
  if (isPlainRecord(left) && isPlainRecord(right)) {
    const keys = Object.keys(left);
    return (
      keys.length === Object.keys(right).length &&
      keys.every((key) => Object.hasOwn(right, key) && sameJson(left[key], right[key]))
    );
  }
  return Object.is(left, right);
}

interface Bounds {
  readonly min?: number | string;
  readonly max?: number | string;
}

function withinBounds(client: Bounds, server: Bounds): boolean {
  return (
    (server.min === undefined || (client.min !== undefined && client.min >= server.min)) &&
    (server.max === undefined || (client.max !== undefined && client.max <= server.max))
  );
}

function compatibleField(source: FieldDescription, target: FieldDescription): boolean {
  if (
    source.type !== target.type ||
    (source.nullable && !target.nullable) ||
    (!source.required && target.required) ||
    !sameJson(Reflect.get(source, "default"), Reflect.get(target, "default"))
  )
    return false;
  if (source.type === "text") {
    const server = target as typeof source;
    return (
      source.unique === server.unique &&
      withinBounds(source, server) &&
      (!server.choices ||
        (!!source.choices && source.choices.every((choice) => server.choices!.includes(choice)))) &&
      (!server.format || source.format === server.format)
    );
  }
  if (source.type === "number") {
    const server = target as typeof source;
    return (source.integer || !server.integer) && withinBounds(source, server);
  }
  if (source.type === "date" || source.type === "datetime")
    return withinBounds(source, target as typeof source);
  if (source.type === "list") {
    const server = target as typeof source;
    return withinBounds(source, server) && compatibleField(source.item, server.item);
  }
  if (source.type === "object")
    return compatibleFields(source.fields, (target as typeof source).fields);
  if (source.type === "blocks") {
    const server = target as typeof source;
    return (
      withinBounds(source, server) &&
      Object.entries(source.variants).every(
        ([name, variant]) =>
          Object.hasOwn(server.variants, name) &&
          compatibleFields(variant.fields, server.variants[name]!.fields),
      )
    );
  }
  if (source.type === "reference") {
    const server = target as typeof source;
    if ("collection" in source || "collection" in server)
      return (
        "collection" in source && "collection" in server && source.collection === server.collection
      );
    return source.collections.every((name) => server.collections.includes(name));
  }
  return true;
}

function compatibleFields(client: Fields, server: Fields): boolean {
  if (Object.keys(client).some((name) => !Object.hasOwn(server, name))) return false;
  return Object.entries(server).every(([name, target]) =>
    Object.hasOwn(client, name) ? compatibleField(client[name]!, target) : !target.required,
  );
}

export function compatibleForCreate(
  client: CollectionDescription,
  server: CollectionDescription,
): boolean {
  return compatibleFields(client.fields, server.fields);
}

/** Names of the fields whose string values must be unique within the collection. */
export function uniqueFields(description: CollectionDescription): string[] {
  return Object.entries(description.fields)
    .filter(([, field]) => field.type === "text" && field.unique)
    .map(([name]) => name);
}

export function validateStored(description: CollectionDescription, data: unknown): boolean {
  const result = compileDescription(description).validate(data);
  return result.ok && sameJson(data, result.data);
}

function blockVariant(field: BlocksDescription, block: PlainRecord) {
  return typeof block.type === "string" && Object.hasOwn(field.variants, block.type)
    ? field.variants[block.type]
    : undefined;
}

type Visit = (field: FieldDescription, value: unknown, path: Path) => void;

function visitFields(fields: Fields, record: unknown, path: Path, visit: Visit) {
  if (!isPlainRecord(record)) return;
  for (const [name, field] of Object.entries(fields)) {
    if (Object.hasOwn(record, name)) visitValue(field, record[name], [...path, name], visit);
  }
}

function visitValue(field: FieldDescription, value: unknown, path: Path, visit: Visit) {
  visit(field, value, path);
  if (field.type === "object") visitFields(field.fields, value, path, visit);
  if (!Array.isArray(value)) return;
  if (field.type === "list") {
    value.forEach((entry, index) => visitValue(field.item, entry, [...path, index], visit));
  } else if (field.type === "blocks") {
    value.forEach((entry, index) => {
      const variant = isPlainRecord(entry) ? blockVariant(field, entry) : undefined;
      if (variant) visitFields(variant.fields, entry, [...path, index], visit);
    });
  }
}

export interface DocumentReference {
  path: Path;
  collection: string;
  id: string;
}

/** Every non-null reference in a validated document, depth first in declaration order. */
export function documentReferences(
  description: CollectionDescription,
  data: DocumentData,
): DocumentReference[] {
  const found: DocumentReference[] = [];
  visitFields(description.fields, data, [], (field, value, path) => {
    if (field.type !== "reference") return;
    if ("collection" in field) {
      if (typeof value === "string") found.push({ path, collection: field.collection, id: value });
    } else if (
      isPlainRecord(value) &&
      typeof value.collection === "string" &&
      typeof value.id === "string"
    ) {
      found.push({ path, collection: value.collection, id: value.id });
    }
  });
  return found;
}

function recordWithIds(fields: Fields, record: PlainRecord, newId: () => string): PlainRecord {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      Object.hasOwn(fields, key) ? valueWithIds(fields[key]!, value, newId) : value,
    ]),
  );
}

function withId(record: PlainRecord, newId: () => string): PlainRecord {
  return typeof record.id === "string" ? record : { ...record, id: newId() };
}

function valueWithIds(field: FieldDescription, value: unknown, newId: () => string): unknown {
  if (field.type === "object")
    return isPlainRecord(value) ? recordWithIds(field.fields, value, newId) : value;
  if (!Array.isArray(value)) return value;
  if (field.type === "list") {
    return value.map((entry) => {
      if (field.item.type !== "object" || !isPlainRecord(entry))
        return valueWithIds(field.item, entry, newId);
      return withId(recordWithIds(field.item.fields, entry, newId), newId);
    });
  }
  if (field.type === "blocks") {
    return value.map((entry) => {
      const variant = isPlainRecord(entry) ? blockVariant(field, entry) : undefined;
      return variant && isPlainRecord(entry)
        ? withId(recordWithIds(variant.fields, entry, newId), newId)
        : entry;
    });
  }
  return value;
}

/** A copy of `data` where every block and list-of-object row without an id has `newId()`, at any depth. */
export function assignIds(
  description: CollectionDescription,
  data: DocumentData,
  newId: () => string,
): DocumentData {
  return recordWithIds(description.fields, data, newId) as DocumentData;
}

function pick(fields: Fields, record: PlainRecord, keep: readonly string[]): PlainRecord {
  return Object.fromEntries(
    Object.entries(record)
      .filter(([key]) => keep.includes(key) || Object.hasOwn(fields, key))
      .map(([key, value]) => [
        key,
        Object.hasOwn(fields, key) ? projected(fields[key]!, value) : value,
      ]),
  );
}

function projected(field: FieldDescription, value: unknown): unknown {
  if (field.type === "object") return isPlainRecord(value) ? pick(field.fields, value, []) : value;
  if (!Array.isArray(value)) return value;
  if (field.type === "list") {
    return value.map((entry) =>
      field.item.type === "object" && isPlainRecord(entry)
        ? pick(field.item.fields, entry, ["id"])
        : projected(field.item, entry),
    );
  }
  if (field.type === "blocks") {
    return value.flatMap((entry) => {
      if (!isPlainRecord(entry) || typeof entry.type !== "string") return [entry];
      const variant = blockVariant(field, entry);
      return variant ? [pick(variant.fields, entry, ["type", "id"])] : [];
    });
  }
  return value;
}

export function projectDocument(
  client: CollectionDescription,
  server: CollectionDescription,
  document: ContentDocument,
): Result<ContentDocument> {
  if (Object.keys(client.fields).some((name) => !Object.hasOwn(server.fields, name)))
    return { ok: false, error: { code: "schema_mismatch" } };
  const { id, ...rest } = document;
  const data = pick(client.fields, rest, []) as DocumentData;
  if (!validateStored(client, data)) return { ok: false, error: { code: "schema_mismatch" } };
  return { ok: true, data: { id, ...data } };
}

function issue(input: unknown): ValidationIssue | undefined {
  if (!isPlainRecord(input) || typeof input.message !== "string" || !Array.isArray(input.path))
    return undefined;
  const path: (string | number)[] = [];
  for (const value of input.path) {
    if (typeof value !== "string" && !isCount(value)) return undefined;
    path.push(value);
  }
  const details = { path, message: input.message };
  if (isMember(plainIssueCodes, input.code)) return { ...details, code: input.code };
  switch (input.code) {
    case "invalid_type":
      if (!isMember(expectedTypes, input.expected) || !isMember(receivedTypes, input.received))
        return undefined;
      return {
        ...details,
        code: "invalid_type",
        expected: input.expected,
        received: input.received,
      };
    case "too_short":
    case "too_long": {
      const bound = input.code === "too_short" ? input.minimum : input.maximum;
      if (!isCount(bound) || !isCount(input.actual) || input.unit !== "graphemes") return undefined;
      return input.code === "too_short"
        ? { ...details, code: "too_short", minimum: bound, actual: input.actual, unit: "graphemes" }
        : { ...details, code: "too_long", maximum: bound, actual: input.actual, unit: "graphemes" };
    }
    case "too_small":
      if (!isNumber(input.minimum) || !isNumber(input.actual)) return undefined;
      return { ...details, code: "too_small", minimum: input.minimum, actual: input.actual };
    case "too_large":
      if (!isNumber(input.maximum) || !isNumber(input.actual)) return undefined;
      return { ...details, code: "too_large", maximum: input.maximum, actual: input.actual };
    case "too_early":
      if (typeof input.minimum !== "string" || typeof input.actual !== "string") return undefined;
      return { ...details, code: "too_early", minimum: input.minimum, actual: input.actual };
    case "too_late":
      if (typeof input.maximum !== "string" || typeof input.actual !== "string") return undefined;
      return { ...details, code: "too_late", maximum: input.maximum, actual: input.actual };
    case "too_few":
      if (!isCount(input.minimum) || !isCount(input.actual)) return undefined;
      return { ...details, code: "too_few", minimum: input.minimum, actual: input.actual };
    case "too_many":
      if (!isCount(input.maximum) || !isCount(input.actual)) return undefined;
      return { ...details, code: "too_many", maximum: input.maximum, actual: input.actual };
    case "out_of_range":
      if (!isNumber(input.minimum) || !isNumber(input.maximum) || !isNumber(input.actual))
        return undefined;
      return {
        ...details,
        code: "out_of_range",
        minimum: input.minimum,
        maximum: input.maximum,
        actual: input.actual,
      };
    case "not_found":
      if (typeof input.collection !== "string") return undefined;
      return { ...details, code: "not_found", collection: input.collection };
    case "duplicate_id":
      if (!isCount(input.firstIndex)) return undefined;
      return { ...details, code: "duplicate_id", firstIndex: input.firstIndex };
    case "invalid_block_type": {
      const allowed = names(input.allowed);
      return allowed && { ...details, code: "invalid_block_type", allowed };
    }
    case "invalid_choice": {
      const allowed = names(input.allowed);
      return allowed && { ...details, code: "invalid_choice", allowed };
    }
  }
  return undefined;
}

export function parseContentError(input: unknown): ContentError | undefined {
  if (!isPlainRecord(input)) return undefined;
  if (input.code === "validation_failed") {
    if (!Array.isArray(input.issues) || input.issues.length === 0) return undefined;
    const issues: ValidationIssue[] = [];
    for (const value of input.issues) {
      const parsed = issue(value);
      if (!parsed) return undefined;
      issues.push(parsed);
    }
    return { code: "validation_failed", issues: [issues[0]!, ...issues.slice(1)] };
  }
  if (input.code === "unique_conflict") {
    return typeof input.field === "string"
      ? { code: "unique_conflict", field: input.field }
      : undefined;
  }
  return isMember(plainErrorCodes, input.code) ? { code: input.code } : undefined;
}
