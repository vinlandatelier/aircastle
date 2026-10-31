import {
  isListLimit,
  isListQueryKey,
  isListSort,
  parseContentError,
  validateStored,
} from "@aircastle/contracts";
import { isPlainRecord } from "@aircastle/schema";
import type {
  CollectionDescription,
  ContentDocument,
  DocumentData,
  DocumentPage,
  Result,
} from "@aircastle/contracts";

export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The lowercase form of a document id, or undefined when `id` is not a UUID string. */
export function documentId(id: unknown): string | undefined {
  return typeof id === "string" && uuid.test(id) ? id.toLowerCase() : undefined;
}

export function storedDocument(
  description: CollectionDescription,
  value: unknown,
): ContentDocument | undefined {
  if (!isPlainRecord(value) || typeof value.id !== "string" || !uuid.test(value.id))
    return undefined;
  const fields = Object.fromEntries(Object.entries(value).filter(([key]) => key !== "id"));
  if (!validateStored(description, fields)) return undefined;
  return { id: value.id, ...(fields as DocumentData) };
}

export function deletedDocument(value: unknown): { id: string } | undefined {
  if (!isPlainRecord(value) || Object.keys(value).length !== 1) return undefined;
  return typeof value.id === "string" && uuid.test(value.id) ? { id: value.id } : undefined;
}

export function documentPage(
  description: CollectionDescription,
  value: unknown,
): DocumentPage | undefined {
  if (
    !isPlainRecord(value) ||
    Object.keys(value).some((key) => key !== "documents" && key !== "next") ||
    !Array.isArray(value.documents) ||
    !(value.next === null || (typeof value.next === "string" && value.next.length > 0))
  )
    return undefined;
  const documents: ContentDocument[] = [];
  for (const entry of value.documents) {
    const document = storedDocument(description, entry);
    if (!document) return undefined;
    documents.push(document);
  }
  return { documents, next: value.next };
}

export function envelope<Data>(
  response: unknown,
  parse: (data: unknown) => Data | undefined,
): Result<Data> | undefined {
  if (!isPlainRecord(response)) return undefined;
  if (response.ok === false) {
    if (Object.keys(response).some((key) => key !== "ok" && key !== "error")) return undefined;
    const error = parseContentError(response.error);
    return error ? { ok: false, error } : undefined;
  }
  if (response.ok !== true || Object.keys(response).some((key) => key !== "ok" && key !== "data"))
    return undefined;
  const data = parse(response.data);
  return data === undefined ? undefined : { ok: true, data };
}

function definedEntries(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

export function updateRequest(
  changes: unknown,
  options: unknown,
): { changes: Record<string, unknown>; unset: string[] } | undefined {
  if (!isPlainRecord(changes) || (options !== undefined && !isPlainRecord(options)))
    return undefined;
  const unset: unknown = options?.unset ?? [];
  if (!Array.isArray(unset) || !unset.every((name) => typeof name === "string")) return undefined;
  const supplied = definedEntries(changes);
  if (new Set(unset).size !== unset.length || unset.some((name) => Object.hasOwn(supplied, name)))
    return undefined;
  return { changes: supplied, unset: [...unset] };
}

export function listRequest(query: unknown): Record<string, unknown> | undefined {
  if (query === undefined) return {};
  if (!isPlainRecord(query)) return undefined;
  const request = definedEntries(query);
  const { where, sort, limit, cursor } = request;
  if (
    !Object.keys(request).every(isListQueryKey) ||
    (where !== undefined && !isPlainRecord(where)) ||
    (sort !== undefined && !isListSort(sort)) ||
    (limit !== undefined && !isListLimit(limit)) ||
    (cursor !== undefined && (typeof cursor !== "string" || cursor.length === 0))
  )
    return undefined;
  return request;
}
