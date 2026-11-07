import { createHash } from "node:crypto";
import {
  defaultListLimit,
  isListLimit,
  isListSort,
  type CollectionDescription,
  type ContentDocument,
  type DocumentListQuery,
  type Result,
} from "@aircastle/contracts";

/**
 * A stored-value condition on one top-level text field. Missing and null values never match `is`,
 * `in` or `contains`, and always match `not` and `empty: true`. `contains` compares Unicode default
 * lowercase mappings and treats every character literally.
 */
export type FieldFilter =
  | { field: string; operator: "is"; value: string }
  | { field: string; operator: "not"; value: string }
  | { field: string; operator: "in"; values: readonly [string, ...string[]] }
  | { field: string; operator: "empty"; empty: boolean }
  | { field: string; operator: "contains"; text: string };
/** Where a stored value sorts: a present string, or missing and null together. */
export type SortValue = { kind: "value"; value: string } | { kind: "empty" };
/** A document's place in the default order. Larger `created` values were created later. */
export interface CreatedPosition {
  order: "created";
  created: bigint;
}
/** A document's place in a field sort: its sort value, then its creation order. */
export interface FieldPosition {
  order: "field";
  value: SortValue;
  created: bigint;
}
export type ListPosition = CreatedPosition | FieldPosition;
/**
 * List order with an optional `after` position from the previous page; the page starts strictly
 * after it. `created` returns the newest documents first. `field` sorts present values by the
 * Unicode root collation, breaks collation ties by UTF-8 bytes, places missing and null after all
 * values in both directions, and orders equal values newest first.
 */
export type ListOrder =
  | { by: "created"; after: CreatedPosition | undefined }
  | {
      by: "field";
      field: string;
      direction: "ascending" | "descending";
      after: FieldPosition | undefined;
    };
/** A page request. Every filter must match. */
export interface PageRequest {
  filters: readonly FieldFilter[];
  order: ListOrder;
  limit: number;
}
/** A stored document with its position in the requested order. */
export interface PageEntry {
  document: ContentDocument;
  position: ListPosition;
}
/** At most `limit` entries in order, and whether further matching documents exist. */
export interface StoredPage {
  entries: PageEntry[];
  more: boolean;
}

/** A list query whose syntax is valid; its meaning is not yet checked against a schema. */
export interface ListSyntax {
  where: Readonly<Record<string, unknown>>;
  sort: string | undefined;
  limit: number;
  cursor: DecodedCursor | undefined;
}

/** What a list query asks the store for, and the digest its cursors carry. */
export interface ListPlan {
  request: PageRequest;
  digest: string;
}

interface DecodedCursor {
  digest: string;
  created: bigint;
  value: SortValue | undefined;
}

type Condition = readonly [operator: FieldFilter["operator"], value: unknown];

const maximumInValues = 100;
const cursorText = /^[A-Za-z0-9_-]+$/;
const jsonString = String.raw`"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"`;
const cursorJson = new RegExp(
  String.raw`^\{"v":1,"q":"([0-9a-f]{64})","c":"(0|[1-9][0-9]{0,18})"(?:,"s":(null|${jsonString}))?\}$`,
);
const unpairedSurrogate = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
const operators = new Set<string>(["is", "not", "in", "empty", "contains"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isText = (value: unknown): value is string =>
  typeof value === "string" && !value.includes("\u0000") && !unpairedSurrogate.test(value);

function decodeCursor(cursor: string): DecodedCursor | undefined {
  if (!cursorText.test(cursor)) return undefined;
  const bytes = Buffer.from(cursor, "base64url");
  const text = bytes.toString("utf8");
  if (Buffer.from(text, "utf8").toString("base64url") !== cursor) return undefined;
  const match = cursorJson.exec(text);
  if (!match) return undefined;
  const [, digest, created, sort] = match;
  if (digest === undefined || created === undefined) return undefined;
  const value: unknown = sort === undefined ? undefined : JSON.parse(sort);
  return {
    digest,
    created: BigInt(created),
    value:
      value === undefined
        ? undefined
        : typeof value === "string"
          ? { kind: "value", value }
          : { kind: "empty" },
  };
}

/** Encodes a cursor that continues a query with `digest` strictly after `position`. */
export function encodeCursor(digest: string, position: ListPosition): string {
  const sort =
    position.order === "field"
      ? { s: position.value.kind === "value" ? position.value.value : null }
      : {};
  const text = JSON.stringify({ v: 1, q: digest, c: position.created.toString(), ...sort });
  return Buffer.from(text, "utf8").toString("base64url");
}

/** Checks the shape of `limit`, `sort`, `where` and `cursor`, without consulting a schema. */
export function listSyntax(query: DocumentListQuery): ListSyntax | undefined {
  const { where = {}, sort, limit = defaultListLimit, cursor } = query;
  if (!isRecord(where)) return undefined;
  if (!isListLimit(limit)) return undefined;
  if (sort !== undefined && !isListSort(sort)) return undefined;
  const decoded = cursor === undefined ? undefined : decodeCursor(cursor);
  if (cursor !== undefined && decoded === undefined) return undefined;
  return { where, sort, limit, cursor: decoded };
}

function conditions(spec: unknown): Condition[] | undefined {
  if (typeof spec === "string") return [["is", spec]];
  if (!isRecord(spec)) return undefined;
  const entries = Object.entries(spec);
  if (entries.length === 0 || entries.some(([operator]) => !operators.has(operator)))
    return undefined;
  return entries
    .map(([operator, value]) => [operator as FieldFilter["operator"], value] as const)
    .sort(([left], [right]) => (left < right ? -1 : 1));
}

function filterFor(field: string, [operator, value]: Condition): FieldFilter | undefined {
  switch (operator) {
    case "is":
    case "not":
      return isText(value) ? { field, operator, value } : undefined;
    case "contains":
      return isText(value) && value !== "" ? { field, operator, text: value } : undefined;
    case "empty":
      return typeof value === "boolean" ? { field, operator, empty: value } : undefined;
    case "in": {
      if (!Array.isArray(value) || value.length > maximumInValues) return undefined;
      const [first, ...rest] = value;
      if (!isText(first) || !rest.every(isText)) return undefined;
      return { field, operator, values: [first, ...rest] };
    }
  }
}

type Field = "missing" | "conflict" | "text";

function fieldKind(
  name: string,
  client: CollectionDescription,
  server: CollectionDescription,
): Field {
  if (!Object.hasOwn(client.fields, name) || !Object.hasOwn(server.fields, name)) return "missing";
  const clientField = client.fields[name]!;
  const serverField = server.fields[name]!;
  return clientField.type === serverField.type ? "text" : "conflict";
}

const mismatch = { ok: false, error: { code: "schema_mismatch" } } as const;
const invalid = { ok: false, error: { code: "invalid_request" } } as const;

/**
 * Resolves a syntactically valid query against the client and server schemas: field membership,
 * kinds, operator values and the cursor digest. The digest binds the project, the collection, the
 * sort and the filter in normal form, so equivalent spellings of one filter share cursors.
 */
export function listPlan(
  syntax: ListSyntax,
  scope: { project: string; collection: string },
  client: CollectionDescription,
  server: CollectionDescription,
): Result<ListPlan> {
  const filters: FieldFilter[] = [];
  const normal: [string, Condition[]][] = [];
  for (const [field, spec] of Object.entries(syntax.where)) {
    const kind = fieldKind(field, client, server);
    if (kind === "missing") return invalid;
    if (kind === "conflict") return mismatch;
    const parsed = conditions(spec);
    if (!parsed) return invalid;
    for (const condition of parsed) {
      const filter = filterFor(field, condition);
      if (!filter) return invalid;
      filters.push(filter);
    }
    normal.push([field, parsed]);
  }
  normal.sort(([left], [right]) => (left < right ? -1 : 1));
  const descending = syntax.sort?.startsWith("-") ?? false;
  const sortField = descending ? syntax.sort?.slice(1) : syntax.sort;
  if (sortField !== undefined) {
    const kind = fieldKind(sortField, client, server);
    if (kind === "missing") return invalid;
    if (kind === "conflict") return mismatch;
  }
  const digest = createHash("sha256")
    .update(JSON.stringify([scope.project, scope.collection, syntax.sort ?? null, normal]))
    .digest("hex");
  const cursor = syntax.cursor;
  if (cursor !== undefined && cursor.digest !== digest) return invalid;
  if (sortField === undefined) {
    if (cursor?.value !== undefined) return invalid;
    return {
      ok: true,
      data: {
        digest,
        request: {
          filters,
          limit: syntax.limit,
          order: {
            by: "created",
            after: cursor && { order: "created", created: cursor.created },
          },
        },
      },
    };
  }
  if (cursor !== undefined && cursor.value === undefined) return invalid;
  return {
    ok: true,
    data: {
      digest,
      request: {
        filters,
        limit: syntax.limit,
        order: {
          by: "field",
          field: sortField,
          direction: descending ? "descending" : "ascending",
          after: cursor?.value && {
            order: "field",
            value: cursor.value,
            created: cursor.created,
          },
        },
      },
    },
  };
}
