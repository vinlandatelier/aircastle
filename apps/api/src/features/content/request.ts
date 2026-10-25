import type { Context } from "hono";
import type { Result } from "@aircastle/contracts";
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
