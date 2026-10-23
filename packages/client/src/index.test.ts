import type { Fetch } from "@aircastle/contracts";
import { collection, text } from "@aircastle/schema";
import { describe, expect, test, vi } from "vite-plus/test";
import { createClient } from "./index.ts";

const project = "11111111-1111-4111-8111-111111111111";
const id = "33333333-3333-4333-8333-333333333333";
const article = { id, title: "Hello", slug: "hello", status: "draft" };
const options = () => ({
  url: "https://cms.example.com/",
  project,
  collections: {
    articles: collection({
      title: text().min(1),
      slug: text().unique(),
      summary: text().optional(),
      status: text().oneOf(["draft", "published"]).default("draft"),
    }),
  },
  apiKey: "server-only-secret",
});
function requestFor(input: Parameters<Fetch>[0], init?: RequestInit): Request {
  return input instanceof Request ? new Request(input, init) : new Request(String(input), init);
}

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function clientWith(body: unknown, status = 200) {
  const transport = vi.fn<Fetch>(async () => reply(body, status));
  return { client: createClient({ ...options(), fetch: transport }), transport };
}

describe("typed HTTP client protocol", () => {
  test("create sends a project-scoped JSON request and returns the saved document", async () => {
    let observed: Request | undefined;
    const transport = vi.fn<Fetch>(async (input, init) => {
      observed = requestFor(input, init);
      return reply({ ok: true, data: article }, 201);
    });
    const client = createClient({ ...options(), fetch: transport });
    expect(transport).not.toHaveBeenCalled();
    expect(await client.articles.create({ title: "Hello", slug: "hello" })).toEqual({
      ok: true,
      data: article,
    });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(observed).toBeDefined();
    expect(observed!.url).toBe(
      `https://cms.example.com/api/projects/${project}/collections/articles/documents`,
    );
    expect(observed!.method).toBe("POST");
    expect(observed!.headers.get("authorization")).toBe("Bearer server-only-secret");
    expect(observed!.headers.get("content-type")).toMatch(/^application\/json(?:;|$)/);
    expect(observed!.headers.get("aircastle-schema")).toMatch(/^v1:[a-f0-9]{64}$/);
    const sent: unknown = await observed!.json();
    expect(sent).toMatchObject({ title: "Hello", slug: "hello" });
    expect(sent).not.toHaveProperty("id");
    expect(sent).not.toHaveProperty("apiKey");
    expect(sent).not.toHaveProperty("project");
    expect(sent).not.toHaveProperty("schema");
  });

  test("findById sends GET with the same project and contract binding", async () => {
    let observed: Request | undefined;
    const transport = vi.fn<Fetch>(async (input, init) => {
      observed = requestFor(input, init);
      return reply({ ok: true, data: article });
    });
    const client = createClient({ ...options(), fetch: transport });
    expect(await client.articles.findById(id)).toEqual({ ok: true, data: article });
    expect(observed!.method).toBe("GET");
    expect(observed!.url).toBe(
      `https://cms.example.com/api/projects/${project}/collections/articles/documents/${id}`,
    );
    expect(observed!.headers.get("authorization")).toBe("Bearer server-only-secret");
    expect(observed!.headers.get("aircastle-schema")).toMatch(/^v1:[a-f0-9]{64}$/);
    expect(await observed!.text()).toBe("");
    expect(transport).toHaveBeenCalledTimes(1);
  });

  test("a legal collection named toString has its own collection methods", async () => {
    const transport = vi.fn<Fetch>(async () =>
      reply({ ok: true, data: { id, title: "Hello" } }, 201),
    );
    const client = createClient({
      ...options(),
      collections: { toString: collection({ title: text() }) },
      fetch: transport,
    });
    expect(Object.hasOwn(client, "toString")).toBe(true);
    expect(await client.toString.create({ title: "Hello" })).toEqual({
      ok: true,
      data: { id, title: "Hello" },
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  test("a reused client does not cache a prior document as the next read", async () => {
    let count = 0;
    const transport = vi.fn<Fetch>(async () =>
      reply({ ok: true, data: { ...article, title: ++count === 1 ? "First" : "Second" } }),
    );
    const client = createClient({ ...options(), fetch: transport });
    expect(await client.articles.findById(id)).toEqual({
      ok: true,
      data: { ...article, title: "First" },
    });
    expect(await client.articles.findById(id)).toEqual({
      ok: true,
      data: { ...article, title: "Second" },
    });
    expect(transport).toHaveBeenCalledTimes(2);
  });

  test("a client snapshots declarations before callers replace their source config", async () => {
    const collections = { articles: collection({ title: text().min(1) }) };
    const transport = vi.fn<Fetch>(async () => reply({ ok: true, data: { id, title: "Hi" } }, 201));
    const client = createClient({
      url: "https://cms.example.com",
      project,
      apiKey: "secret",
      collections,
      fetch: transport,
    });
    collections.articles = collection({ title: text().min(8) });
    expect(await client.articles.create({ title: "Hi" })).toEqual({
      ok: true,
      data: { id, title: "Hi" },
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  test("preserves explicit null and omits optional undefined during valid serialization", async () => {
    let observed: unknown;
    const transport = vi.fn<Fetch>(async (input, init) => {
      observed = await requestFor(input, init).json();
      return reply({ ok: true, data: { id, title: "Hello", nullable: null } }, 201);
    });
    const client = createClient({
      url: "https://cms.example.com",
      project,
      apiKey: "secret",
      collections: {
        articles: collection({
          title: text(),
          optional: text().optional(),
          nullable: text().nullable(),
        }),
      },
      fetch: transport,
    });
    expect(
      await client.articles.create({ title: "Hello", optional: undefined, nullable: null }),
    ).toEqual({ ok: true, data: { id, title: "Hello", nullable: null } });
    expect(observed).toEqual({ title: "Hello", nullable: null });
  });

  test("returns aggregate local validation errors before serialization", async () => {
    const transport = vi.fn<Fetch>();
    const client = createClient({ ...options(), fetch: transport });
    const result: unknown = await Reflect.apply(
      Reflect.get(client.articles, "create"),
      client.articles,
      [{ slug: 4 }],
    );
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "validation_failed",
        issues: [
          { code: "required", path: ["title"] },
          { code: "invalid_type", path: ["slug"], expected: "string", received: "number" },
        ],
      },
    });
    expect(transport).not.toHaveBeenCalled();
  });

  test("invalid accessors are rejected without invoking supplied code or fetching", async () => {
    let getterCalled = false;
    const input = Object.defineProperty({ slug: "hello" }, "title", {
      enumerable: true,
      get() {
        getterCalled = true;
        return "Hello";
      },
    });
    const transport = vi.fn<Fetch>();
    const client = createClient({ ...options(), fetch: transport });
    expect(
      await Reflect.apply(Reflect.get(client.articles, "create"), client.articles, [input]),
    ).toMatchObject({
      ok: false,
      error: { code: "validation_failed", issues: [{ code: "invalid_document", path: [] }] },
    });
    expect(getterCalled).toBe(false);
    expect(transport).not.toHaveBeenCalled();
  });

  test.each([
    ["symbol property", () => ({ title: "Hello", slug: "hello", [Symbol("hidden")]: "secret" })],
    [
      "non-enumerable property",
      () => Object.defineProperty({ title: "Hello", slug: "hello" }, "hidden", { value: "secret" }),
    ],
    ["array root", () => ["Hello"]],
    ["invalid Unicode", () => ({ title: "\ud800", slug: "hello" })],
    ["NUL character", () => ({ title: "Hello\0", slug: "hello" })],
    ["supplied system ID", () => ({ title: "Hello", slug: "hello", id })],
  ])("rejects %s before unsafe JSON conversion", async (_name, makeInput) => {
    const transport = vi.fn<Fetch>();
    const client = createClient({ ...options(), fetch: transport });
    expect(
      await Reflect.apply(Reflect.get(client.articles, "create"), client.articles, [makeInput()]),
    ).toMatchObject({ ok: false, error: { code: "validation_failed" } });
    expect(transport).not.toHaveBeenCalled();
  });
});

describe("SDK failures and uncertain writes", () => {
  test.each([
    ["invalid_request", { code: "invalid_request" }, 400],
    ["not_found", { code: "not_found" }, 404],
    ["schema_conflict", { code: "schema_conflict" }, 409],
    ["migration_required", { code: "migration_required" }, 409],
    ["payload_too_large", { code: "payload_too_large" }, 413],
    ["internal_error", { code: "internal_error" }, 500],
    ["unauthorized", { code: "unauthorized" }, 401],
    ["forbidden", { code: "forbidden" }, 403],
    ["schema_mismatch", { code: "schema_mismatch" }, 409],
    ["unavailable", { code: "unavailable" }, 503],
  ])("preserves %s without retrying a read", async (_name, error, status) => {
    const { client, transport } = clientWith({ ok: false, error }, status);
    expect(await client.articles.findById(id)).toEqual({ ok: false, error });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  test("preserves the database-detected unique field", async () => {
    const error = { code: "unique_conflict", field: "slug" };
    const { client, transport } = clientWith({ ok: false, error }, 409);
    expect(await client.articles.create({ title: "Hello", slug: "hello" })).toEqual({
      ok: false,
      error,
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  test("preserves structured validation details and issue order", async () => {
    const error = {
      code: "validation_failed",
      issues: [
        {
          code: "too_short",
          path: ["title"],
          minimum: 5,
          actual: 2,
          unit: "graphemes",
          message: "Too short",
        },
        {
          code: "invalid_choice",
          path: ["status"],
          allowed: ["draft", "published"],
          message: "Choose a status",
        },
      ],
    };
    const { client } = clientWith({ ok: false, error }, 422);
    expect(await client.articles.create({ title: "Hello", slug: "hello" })).toEqual({
      ok: false,
      error,
    });
  });

  test("a failed read returns transport_error without leaking exception details or retrying", async () => {
    const transport = vi.fn<Fetch>(async () => {
      throw new Error("SQL password=secret connection lost");
    });
    const client = createClient({ ...options(), fetch: transport });
    expect(await client.articles.findById(id)).toEqual({
      ok: false,
      error: { code: "transport_error" },
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  test("a lost create response reports unknown_write_outcome and never retries", async () => {
    const transport = vi.fn<Fetch>(async () => {
      throw new DOMException("reply lost", "AbortError");
    });
    const client = createClient({ ...options(), fetch: transport });
    expect(await client.articles.create({ title: "Hello", slug: "hello" })).toEqual({
      ok: false,
      error: { code: "unknown_write_outcome" },
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["missing envelope", {}],
    ["nonboolean discriminator", { ok: "true", data: article }],
    ["missing document", { ok: true }],
    ["null document", { ok: true, data: null }],
    [
      "missing generated id",
      { ok: true, data: { title: "Hello", slug: "hello", status: "draft" } },
    ],
    ["malformed id", { ok: true, data: { ...article, id: "not-a-uuid" } }],
    ["wrong field type", { ok: true, data: { ...article, title: 42 } }],
    ["invalid length", { ok: true, data: { ...article, title: "" } }],
    ["invalid choice", { ok: true, data: { ...article, status: "archived" } }],
    ["invalid Unicode", { ok: true, data: { ...article, title: "\ud800" } }],
    ["missing defaulted output", { ok: true, data: { id, title: "Hello", slug: "hello" } }],
    ["unknown returned field", { ok: true, data: { ...article, private: "secret" } }],
    ["unknown error code", { ok: false, error: { code: "anything" } }],
    ["missing unique details", { ok: false, error: { code: "unique_conflict" } }],
    ["empty validation issues", { ok: false, error: { code: "validation_failed", issues: [] } }],
    [
      "invalid issue details",
      {
        ok: false,
        error: {
          code: "validation_failed",
          issues: [
            {
              code: "too_short",
              path: ["title"],
              message: "Short",
              minimum: 1,
              actual: 0,
              unit: "bytes",
            },
          ],
        },
      },
    ],
  ])("rejects malformed %s as a read transport failure", async (_name, response) => {
    const { client, transport } = clientWith(response);
    expect(await client.articles.findById(id)).toEqual({
      ok: false,
      error: { code: "transport_error" },
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  test("malformed create success cannot imply a confirmed rollback", async () => {
    const { client, transport } = clientWith({ ok: true, data: { title: "Hello" } }, 201);
    expect(await client.articles.create({ title: "Hello", slug: "hello" })).toEqual({
      ok: false,
      error: { code: "unknown_write_outcome" },
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  test.each(["read", "create"] as const)(
    "invalid JSON in a %s response is an explicit transport outcome",
    async (operation) => {
      const transport = vi.fn<Fetch>(
        async () =>
          new Response("{", {
            status: operation === "create" ? 201 : 200,
            headers: { "content-type": "application/json" },
          }),
      );
      const client = createClient({ ...options(), fetch: transport });
      const result =
        operation === "create"
          ? await client.articles.create({ title: "Hello", slug: "hello" })
          : await client.articles.findById(id);
      expect(result).toEqual({
        ok: false,
        error: { code: operation === "create" ? "unknown_write_outcome" : "transport_error" },
      });
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );
});
