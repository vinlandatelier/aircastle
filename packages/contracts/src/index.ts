import {
  compileSchema,
  isMember,
  isPlainRecord,
  SchemaError,
  type CollectionDefinitions,
  type CollectionDescription,
  type CompiledCollection,
  type ValidationIssue,
  type ReceivedType,
} from "@aircastle/schema";
import { collectionName, decodeCollections, decodeDescription, fieldName } from "./decode.ts";

export { authEmail, authSetupInput, authSignInInput } from "./auth.ts";
export type { CollectionDescription, CollectionDefinitions } from "@aircastle/schema";
export type DocumentData = Record<string, string | null>;
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

type PlainIssueCode = Exclude<
  ValidationIssue["code"],
  "invalid_type" | "too_short" | "too_long" | "invalid_choice"
>;
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
} satisfies { [Name in PlainIssueCode]: Name };
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
        JSON.stringify(Object.keys(entry.description.fields)) ===
          JSON.stringify(Object.keys(other.description.fields)) &&
        canonical(entry.description) === canonical(other.description)
      );
    })
  );
}

export function canonicalContract(description: CollectionDescription): string {
  return canonical({
    fields: Object.fromEntries(
      Object.entries(description.fields).map(([name, field]) => {
        const { editor: _editor, ...data } = field;
        return [name, data];
      }),
    ),
  });
}

export async function contractId(description: CollectionDescription): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalContract(description));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return (
    "v1:" +
    Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("")
  );
}

export function compatibleForCreate(
  client: CollectionDescription,
  server: CollectionDescription,
): boolean {
  if (Object.keys(client.fields).some((name) => !Object.hasOwn(server.fields, name))) return false;
  return Object.entries(server.fields).every(([name, target]) => {
    if (!Object.hasOwn(client.fields, name)) return !target.required;
    const source = client.fields[name]!;
    return (
      !(source.nullable && !target.nullable) &&
      !(!source.required && target.required) &&
      source.default === target.default &&
      source.unique === target.unique &&
      (source.min ?? -Infinity) >= (target.min ?? -Infinity) &&
      (source.max ?? Infinity) <= (target.max ?? Infinity) &&
      (!target.choices ||
        (!!source.choices && source.choices.every((choice) => target.choices!.includes(choice)))) &&
      (!target.format || source.format === target.format)
    );
  });
}

/** Names of the fields whose string values must be unique within the collection. */
export function uniqueFields(description: CollectionDescription): string[] {
  return Object.entries(description.fields)
    .filter(([, field]) => field.unique)
    .map(([name]) => name);
}

export function validateStored(description: CollectionDescription, data: unknown): boolean {
  const result = compileDescription(description).validate(data);
  if (!result.ok) return false;
  /** `validate` succeeded, so `data` is a plain record of data properties. */
  const stored = data as Readonly<Record<string, unknown>>;
  return (
    Object.keys(stored).length === Object.keys(result.data).length &&
    Object.entries(result.data).every(
      ([key, value]) => Object.hasOwn(stored, key) && stored[key] === value,
    )
  );
}

export function projectDocument(
  client: CollectionDescription,
  server: CollectionDescription,
  document: ContentDocument,
): Result<ContentDocument> {
  if (Object.keys(client.fields).some((name) => !Object.hasOwn(server.fields, name)))
    return { ok: false, error: { code: "schema_mismatch" } };
  const data: DocumentData = Object.fromEntries(
    Object.keys(client.fields)
      .filter((name) => Object.hasOwn(document, name))
      .map((name) => [name, document[name]!]),
  );
  if (!validateStored(client, data)) return { ok: false, error: { code: "schema_mismatch" } };
  return { ok: true, data: { id: document.id, ...data } };
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
      if (input.expected !== "string" || !isMember(receivedTypes, input.received)) return undefined;
      return { ...details, code: "invalid_type", expected: "string", received: input.received };
    case "too_short":
    case "too_long": {
      const bound = input.code === "too_short" ? input.minimum : input.maximum;
      if (!isCount(bound) || !isCount(input.actual) || input.unit !== "graphemes") return undefined;
      return input.code === "too_short"
        ? { ...details, code: "too_short", minimum: bound, actual: input.actual, unit: "graphemes" }
        : { ...details, code: "too_long", maximum: bound, actual: input.actual, unit: "graphemes" };
    }
    case "invalid_choice":
      if (
        !Array.isArray(input.allowed) ||
        input.allowed.length === 0 ||
        !input.allowed.every((value: unknown) => typeof value === "string")
      )
        return undefined;
      return { ...details, code: "invalid_choice", allowed: [...input.allowed] };
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
