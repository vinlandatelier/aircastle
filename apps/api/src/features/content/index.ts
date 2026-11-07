import { Hono, type Context } from "hono";
import { describeRoute } from "hono-openapi";
import type { Result } from "@aircastle/contracts";
import type { ContentService } from "@aircastle/core";
import { access, jsonBody, listQuery, searchQuery, updateRequest, uuid } from "./request.ts";
import { failure, reply, unexpectedError } from "./responses.ts";

const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;
const contract = /^v1:[0-9a-f]{64}$/;

interface CollectionTarget {
  name: string;
  fingerprint: string;
}

function collectionTarget(c: Context): Result<CollectionTarget> {
  const name = c.req.param("collection") ?? "";
  const fingerprint = c.req.header("aircastle-schema") ?? "";
  if (!identifier.test(name) || !contract.test(fingerprint)) return failure("invalid_request");
  return { ok: true, data: { name, fingerprint } };
}

function documentTarget(c: Context): Result<CollectionTarget & { id: string }> {
  const target = collectionTarget(c);
  const id = c.req.param("id") ?? "";
  if (!target.ok || !uuid.test(id)) return failure("invalid_request");
  return { ok: true, data: { ...target.data, id: id.toLowerCase() } };
}

export function contentRoutes(options: { cms: ContentService; maxRequestBytes?: number }) {
  const { cms, maxRequestBytes = 1_048_576 } = options;

  if (!Number.isSafeInteger(maxRequestBytes) || maxRequestBytes < 1)
    throw new Error("maxRequestBytes must be a positive safe integer");

  const app = new Hono().onError(unexpectedError);

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

        const target = collectionTarget(c);
        if (!target.ok) return reply(c, target);
        const { name, fingerprint } = target.data;

        return reply(c, await cms.create(credentials.data, name, fingerprint, body.data), 201);
      },
    )
    .get(
      "/projects/:project/collections/:collection/documents/:id",
      describeRoute({ summary: "Read document", tags: ["Content"] }),
      async (c) => {
        const credentials = access(c);
        if (!credentials.ok) return reply(c, credentials);

        const target = documentTarget(c);
        if (!target.ok) return reply(c, target);
        const { name, fingerprint, id } = target.data;

        return reply(c, await cms.findById(credentials.data, name, fingerprint, id));
      },
    )
    .patch(
      "/projects/:project/collections/:collection/documents/:id",
      describeRoute({ summary: "Update document", tags: ["Content"] }),
      async (c) => {
        const body = await jsonBody(c, maxRequestBytes);
        if (!body.ok) return reply(c, body);

        const update = updateRequest(body.data);
        if (!update.ok) return reply(c, update);

        const credentials = access(c);
        if (!credentials.ok) return reply(c, credentials);

        const target = documentTarget(c);
        if (!target.ok) return reply(c, target);
        const { name, fingerprint, id } = target.data;

        return reply(c, await cms.update(credentials.data, name, fingerprint, id, update.data));
      },
    )
    .delete(
      "/projects/:project/collections/:collection/documents/:id",
      describeRoute({ summary: "Delete document", tags: ["Content"] }),
      async (c) => {
        const credentials = access(c);
        if (!credentials.ok) return reply(c, credentials);

        const target = documentTarget(c);
        if (!target.ok) return reply(c, target);
        const { name, fingerprint, id } = target.data;

        return reply(c, await cms.delete(credentials.data, name, fingerprint, id));
      },
    )
    .get(
      "/projects/:project/collections/:collection/documents",
      describeRoute({ summary: "List documents", tags: ["Content"] }),
      async (c) => {
        const query = searchQuery(c);
        if (!query.ok) return reply(c, query);

        const credentials = access(c);
        if (!credentials.ok) return reply(c, credentials);

        const target = collectionTarget(c);
        if (!target.ok) return reply(c, target);
        const { name, fingerprint } = target.data;

        return reply(c, await cms.list(credentials.data, name, fingerprint, query.data));
      },
    )
    .post(
      "/projects/:project/collections/:collection/documents/query",
      describeRoute({ summary: "Query documents", tags: ["Content"] }),
      async (c) => {
        const body = await jsonBody(c, maxRequestBytes);
        if (!body.ok) return reply(c, body);

        const query = listQuery(body.data);
        if (!query.ok) return reply(c, query);

        const credentials = access(c);
        if (!credentials.ok) return reply(c, credentials);

        const target = collectionTarget(c);
        if (!target.ok) return reply(c, target);
        const { name, fingerprint } = target.data;

        return reply(c, await cms.list(credentials.data, name, fingerprint, query.data));
      },
    );
}
