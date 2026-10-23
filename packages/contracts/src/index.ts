import type {
  CollectionDefinitions,
  CollectionDescription,
  CompiledCollection,
  ValidationIssue,
} from "@aircastle/schema";

export type { CollectionDescription, CollectionDefinitions } from "@aircastle/schema";
export type DocumentData = Record<string, string | null>;
export type ContentDocument = DocumentData & { id: string };
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

export function describeCollections(_definitions: CollectionDefinitions): PublishedCollection[] {
  throw new Error("Not implemented");
}
export function parseCollections(_input: unknown): Result<PublishedCollection[]> {
  return { ok: false, error: { code: "invalid_request" } };
}
export function compileDescription(
  _description: CollectionDescription,
): CompiledCollection<DocumentData> {
  throw new Error("Not implemented");
}
export function sameSchema(
  _left: readonly PublishedCollection[],
  _right: readonly PublishedCollection[],
): boolean {
  return false;
}
export async function contractId(_description: CollectionDescription): Promise<string> {
  return "v1:" + "0".repeat(64);
}
export function compatibleForCreate(
  _client: CollectionDescription,
  _server: CollectionDescription,
): boolean {
  return false;
}
export function validateStored(_description: CollectionDescription, _data: unknown): boolean {
  return false;
}
export function projectDocument(
  _client: CollectionDescription,
  _server: CollectionDescription,
  _document: ContentDocument,
): Result<ContentDocument> {
  return { ok: false, error: { code: "schema_mismatch" } };
}
