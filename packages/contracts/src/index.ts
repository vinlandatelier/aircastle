import {
  collection,
  compileSchema,
  text,
  type CodeLanguage,
  type CollectionDefinitions,
  type CollectionDescription,
  type CompiledCollection,
  type ValidationIssue,
  type ReceivedType,
} from "@aircastle/schema";

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

type FieldIdentity = Parameters<typeof collection>[0][string];
interface WireText extends FieldIdentity {
  min(value: number): WireText;
  max(value: number): WireText;
  optional(): WireText;
  nullable(): WireText;
  unique(): WireText;
  default(value: string | null): WireText;
  oneOf(values: readonly string[]): WireText;
  email(): WireText;
  url(): WireText;
  editor(name: "textarea", options?: { rows?: number }): WireText;
  editor(name: "code", options?: { language?: CodeLanguage }): WireText;
  editor(name: "radio", options?: Readonly<Record<string, never>>): WireText;
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
const languages: readonly string[] = [
  "plaintext",
  "javascript",
  "typescript",
  "json",
  "html",
  "css",
  "markdown",
  "sql",
];

function record(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Reflect.ownKeys(value).every((key) => {
    const property = Object.getOwnPropertyDescriptor(value, key);
    return (
      typeof key === "string" && property?.enumerable === true && Object.hasOwn(property, "value")
    );
  });
}

function knownKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function collectionName(value: unknown): value is string {
  return typeof value === "string" && identifier.test(value) && !reservedCollections.has(value);
}

function fieldName(value: string): boolean {
  return identifier.test(value) && value !== "id";
}

function malformed(): never {
  throw new TypeError("Invalid collection description");
}

function wireField(value: unknown): WireText {
  if (
    !record(value) ||
    !knownKeys(value, fieldKeys) ||
    value.type !== "text" ||
    typeof value.required !== "boolean" ||
    typeof value.nullable !== "boolean" ||
    typeof value.unique !== "boolean"
  )
    malformed();
  let builder: WireText = text();
  if (!value.required) builder = builder.optional();
  if (value.nullable) builder = builder.nullable();
  if (value.unique) builder = builder.unique();
  for (const constraint of ["min", "max"] as const) {
    if (Object.hasOwn(value, constraint)) {
      const bound = value[constraint];
      if (typeof bound !== "number") malformed();
      builder = builder[constraint](bound);
    }
  }
  if (Object.hasOwn(value, "choices")) {
    if (
      !Array.isArray(value.choices) ||
      !value.choices.every((choice: unknown) => typeof choice === "string")
    )
      malformed();
    builder = builder.oneOf(value.choices);
  }
  if (Object.hasOwn(value, "format")) {
    if (value.format === "email") builder = builder.email();
    else if (value.format === "url") builder = builder.url();
    else malformed();
  }
  if (Object.hasOwn(value, "default")) {
    if (value.required || (typeof value.default !== "string" && value.default !== null))
      malformed();
    builder = builder.default(value.default);
  }
  if (Object.hasOwn(value, "editor")) {
    const editor = value.editor;
    if (!record(editor)) malformed();
    if (editor.type === "textarea") {
      if (!knownKeys(editor, new Set(["type", "rows"])) || typeof editor.rows !== "number")
        malformed();
      builder = builder.editor("textarea", { rows: editor.rows });
    } else if (editor.type === "code") {
      if (
        !knownKeys(editor, new Set(["type", "language"])) ||
        typeof editor.language !== "string" ||
        !languages.includes(editor.language)
      )
        malformed();
      builder = builder.editor("code", { language: editor.language as CodeLanguage });
    } else if (editor.type === "radio") {
      if (!knownKeys(editor, new Set(["type"]))) malformed();
      builder = builder.editor("radio");
    } else malformed();
  }
  return builder;
}

function decodedDescription(value: unknown): CompiledCollection<DocumentData> {
  if (!record(value) || !knownKeys(value, new Set(["fields"])) || !record(value.fields))
    malformed();
  const fields: Record<string, FieldIdentity> = Object.create(null);
  for (const [name, field] of Object.entries(value.fields)) {
    if (!fieldName(name)) malformed();
    fields[name] = wireField(field);
  }
  return compileSchema({ wire: collection(fields) }).wire;
}

export function describeCollections(definitions: CollectionDefinitions): PublishedCollection[] {
  const compiled = compileSchema(definitions);
  return Object.entries(compiled).map(([name, definition]) => {
    const description = definition.describe();
    if (!collectionName(name) || !Object.keys(description.fields).every(fieldName)) malformed();
    return { name, description };
  });
}

export function parseCollections(input: unknown): Result<PublishedCollection[]> {
  try {
    if (!Array.isArray(input)) malformed();
    const names = new Set<string>();
    const collections: PublishedCollection[] = [];
    for (const entry of input) {
      if (
        !record(entry) ||
        !knownKeys(entry, new Set(["name", "description"])) ||
        !collectionName(entry.name) ||
        names.has(entry.name)
      )
        malformed();
      names.add(entry.name);
      collections.push({
        name: entry.name,
        description: decodedDescription(entry.description).describe(),
      });
    }
    return { ok: true, data: collections };
  } catch {
    return { ok: false, error: { code: "invalid_request" } };
  }
}

export function compileDescription(
  description: CollectionDescription,
): CompiledCollection<DocumentData> {
  return decodedDescription(description);
}

function canonical(value: unknown): string {
  const sorted = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(sorted);
    if (entry !== null && typeof entry === "object") {
      return Object.fromEntries(
        Object.entries(entry)
          .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
          .map(([key, child]) => [key, sorted(child)]),
      );
    }
    return entry;
  };
  const result = JSON.stringify(sorted(value));
  if (result === undefined) malformed();
  return result;
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
      Object.hasOwn(source, "default") === Object.hasOwn(target, "default") &&
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

export function validateStored(description: CollectionDescription, data: unknown): boolean {
  if (!record(data)) return false;
  const result = compileDescription(description).validate(data);
  return (
    result.ok &&
    Object.keys(data).length === Object.keys(result.data).length &&
    Object.entries(result.data).every(
      ([key, value]) => Object.hasOwn(data, key) && data[key] === value,
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
  if (
    !record(input) ||
    typeof input.code !== "string" ||
    typeof input.message !== "string" ||
    !Array.isArray(input.path)
  )
    return undefined;
  const path: (string | number)[] = [];
  for (const value of input.path) {
    if (
      typeof value !== "string" &&
      !(typeof value === "number" && Number.isInteger(value) && value >= 0)
    )
      return undefined;
    path.push(value);
  }
  const details = { path, message: input.message };
  switch (input.code) {
    case "required":
    case "invalid_document":
    case "invalid_unicode":
    case "invalid_character":
    case "invalid_email":
    case "invalid_url":
    case "unknown_field":
      return { ...details, code: input.code };
    case "invalid_type":
      if (
        input.expected !== "string" ||
        typeof input.received !== "string" ||
        ![
          "string",
          "number",
          "boolean",
          "null",
          "undefined",
          "array",
          "object",
          "bigint",
          "symbol",
          "function",
        ].includes(input.received)
      )
        return undefined;
      return {
        ...details,
        code: "invalid_type",
        expected: "string",
        received: input.received as ReceivedType,
      };
    case "too_short":
    case "too_long": {
      const bound = input.code === "too_short" ? input.minimum : input.maximum;
      if (
        typeof bound !== "number" ||
        !Number.isInteger(bound) ||
        bound < 0 ||
        typeof input.actual !== "number" ||
        !Number.isInteger(input.actual) ||
        input.actual < 0 ||
        input.unit !== "graphemes"
      )
        return undefined;
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
    default:
      return undefined;
  }
}

export function parseContentError(input: unknown): ContentError | undefined {
  if (!record(input)) return undefined;
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
  switch (input.code) {
    case "invalid_request":
    case "unauthorized":
    case "forbidden":
    case "not_found":
    case "schema_mismatch":
    case "schema_conflict":
    case "migration_required":
    case "payload_too_large":
    case "internal_error":
    case "unavailable":
    case "transport_error":
    case "unknown_write_outcome":
      return { code: input.code };
    default:
      return undefined;
  }
}
