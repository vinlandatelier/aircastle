import type { Context } from "hono";
import {
  isListLimit,
  isListSort,
  type DocumentListQuery,
  type DocumentUpdate,
  type Result,
} from "@aircastle/contracts";
import type { Access } from "@aircastle/core";
import { failure } from "./responses.ts";

export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function access(c: Context): Result<Access> {
  const bearer = c.req.header("authorization")?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!bearer) return failure("unauthorized");

  const project = c.req.param("project");
  if (!project || !uuid.test(project)) return failure("invalid_request");

  return { ok: true, data: { project: project.toLowerCase(), apiKey: bearer } };
}

export async function jsonBody(c: Context, limit: number): Promise<Result<unknown>> {
  if (!/^application\/json(?:\s*;|$)/i.test(c.req.header("content-type") ?? ""))
    return failure("invalid_request");

  const encoding = c.req.header("content-encoding");
  if (encoding && encoding.toLowerCase() !== "identity") return failure("invalid_request");

  const reader = c.req.raw.body?.getReader();
  if (!reader) return failure("invalid_request");

  let size = 0;
  const chunks: Uint8Array[] = [];

  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) {
        await reader.cancel().catch(() => {});
        return failure("payload_too_large");
      }
      chunks.push(part.value);
    }
  } catch {
    return failure("invalid_request");
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }

  try {
    return { ok: true, data: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) };
  } catch (error) {
    if (error instanceof TypeError || error instanceof SyntaxError)
      return failure("invalid_request");
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNameList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((name) => typeof name === "string") &&
    new Set(value).size === value.length
  );
}

export function updateRequest(input: unknown): Result<DocumentUpdate> {
  if (!isRecord(input) || !isRecord(input.changes)) return failure("invalid_request");

  const { changes, unset = [], ...unknown } = input;
  if (Object.keys(unknown).length > 0 || !isNameList(unset)) return failure("invalid_request");
  if (unset.some((name) => Object.hasOwn(changes, name))) return failure("invalid_request");

  return { ok: true, data: { changes, unset } };
}

export function listQuery(input: unknown): Result<DocumentListQuery> {
  if (!isRecord(input)) return failure("invalid_request");

  const query: DocumentListQuery = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === "where" && isRecord(value)) query.where = value;
    else if (key === "sort" && isListSort(value)) query.sort = value;
    else if (key === "limit" && isListLimit(value)) query.limit = value;
    else if (key === "cursor" && typeof value === "string" && value !== "") query.cursor = value;
    else return failure("invalid_request");
  }

  return { ok: true, data: query };
}

export function searchQuery(c: Context): Result<DocumentListQuery> {
  const entries = [...new URL(c.req.url).searchParams];
  const keys = new Set(entries.map(([key]) => key));
  if (keys.size !== entries.length || entries.some(([, value]) => value === ""))
    return failure("invalid_request");

  return listQuery(
    Object.fromEntries(
      entries.map(([key, value]) => {
        if (key === "where") return [key, parsedJson(value)];
        if (key === "limit") return [key, decimal(value)];
        return [key, value];
      }),
    ),
  );
}

function decimal(text: string): number | string {
  const value = Number(text);
  return String(value) === text ? value : text;
}

function parsedJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}
