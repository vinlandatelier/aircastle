import { Hono, type Context } from "hono";
import { describeRoute } from "hono-openapi";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ContentError, Result } from "@aircastle/contracts";
import type { Access, ContentService } from "@aircastle/core";

const statuses: Record<ContentError["code"], ContentfulStatusCode> = {
  invalid_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  validation_failed: 422,
  unique_conflict: 409,
  schema_mismatch: 409,
  schema_conflict: 409,
  migration_required: 409,
  payload_too_large: 413,
  internal_error: 500,
  unavailable: 503,
  transport_error: 503,
  unknown_write_outcome: 500,
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;
const contract = /^v1:[0-9a-f]{64}$/;

function failure(
  code: Exclude<ContentError["code"], "validation_failed" | "unique_conflict">,
): Result<never> {
  return { ok: false, error: { code } };
}

function reply(c: Context, result: Result<unknown>, success: ContentfulStatusCode = 200) {
  return c.json(result, result.ok ? success : statuses[result.error.code]);
}

function access(c: Context): Result<Access> {
  const bearer = c.req.header("authorization")?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!bearer) return failure("unauthorized");
  const project = c.req.param("project");
  if (!project || !uuid.test(project)) return failure("invalid_request");
  return { ok: true, data: { project: project.toLowerCase(), apiKey: bearer } };
}

async function jsonBody(c: Context, limit: number): Promise<Result<unknown>> {
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
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return { ok: true, data: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) };
  } catch {
    return failure("invalid_request");
  } finally {
    reader.releaseLock();
  }
}

export function contentRoutes(options: { cms: ContentService; maxRequestBytes?: number }) {
  const { cms, maxRequestBytes = 1_048_576 } = options;
  if (!Number.isSafeInteger(maxRequestBytes) || maxRequestBytes < 1)
    throw new Error("maxRequestBytes must be a positive safe integer");
  const app = new Hono().onError((_error, c) => {
    c.error = new Error("Content operation failed");
    return reply(c, failure("internal_error"));
  });
  return app
    .get(
      "/projects/:project/schema",
      describeRoute({ summary: "Read project schema", tags: ["Schema"] }),
      async (c) => {
        const credentials = access(c);
        if (!credentials.ok) return reply(c, credentials);
        return reply(c, await cms.schema(credentials.data));
      },
    )
    .post(
      "/projects/:project/schema",
      describeRoute({ summary: "Publish project schema", tags: ["Schema"] }),
      async (c) => {
        const body = await jsonBody(c, maxRequestBytes);
        if (!body.ok) return reply(c, body);
        const credentials = access(c);
        if (!credentials.ok) return reply(c, credentials);
        const input = body.data;
        if (
          !input ||
          typeof input !== "object" ||
          Array.isArray(input) ||
          !Object.hasOwn(input, "baseline") ||
          !Object.hasOwn(input, "collections") ||
          Object.keys(input).length !== 2 ||
          !("baseline" in input) ||
          !("collections" in input) ||
          !(
            input.baseline === null ||
            (typeof input.baseline === "string" && input.baseline.length > 0)
          )
        )
          return reply(c, failure("invalid_request"));
        return reply(
          c,
          await cms.publish(credentials.data, {
            baseline: input.baseline,
            collections: input.collections,
          }),
        );
      },
    )
    .post(
      "/projects/:project/collections/:collection/documents",
      describeRoute({ summary: "Create document", tags: ["Content"] }),
      async (c) => {
        const body = await jsonBody(c, maxRequestBytes);
        if (!body.ok) return reply(c, body);
        const credentials = access(c);
        if (!credentials.ok) return reply(c, credentials);
        const name = c.req.param("collection");
        const fingerprint = c.req.header("aircastle-schema") ?? "";
        if (!identifier.test(name) || !contract.test(fingerprint))
          return reply(c, failure("invalid_request"));
        return reply(c, await cms.create(credentials.data, name, fingerprint, body.data), 201);
      },
    )
    .get(
      "/projects/:project/collections/:collection/documents/:id",
      describeRoute({ summary: "Read document", tags: ["Content"] }),
      async (c) => {
        const credentials = access(c);
        if (!credentials.ok) return reply(c, credentials);
        const name = c.req.param("collection");
        const id = c.req.param("id");
        const fingerprint = c.req.header("aircastle-schema") ?? "";
        if (!identifier.test(name) || !uuid.test(id) || !contract.test(fingerprint))
          return reply(c, failure("invalid_request"));
        return reply(c, await cms.findById(credentials.data, name, fingerprint, id));
      },
    );
}
