import type { Fetch } from "@aircastle/contracts";
import { collection, text } from "@aircastle/schema";
import { describe, expect, test, vi } from "vite-plus/test";
import { createClient } from "./index.ts";

const project = "11111111-1111-4111-8111-111111111111";
const id = "33333333-3333-4333-8333-333333333333";
const upperId = "ABCDEF33-3333-4333-8333-ABCDEFABCDEF";
const lowerId = "abcdef33-3333-4333-8333-abcdefabcdef";
const otherId = "44444444-4444-4444-8444-444444444444";
const endpoint = `https://cms.example.com/api/projects/${project}/collections/articles/documents`;
const article = { id, title: "Hello", slug: "hello", status: "draft" };
const second = {
  id: otherId,
  title: "Zebra",
  slug: "zebra",
  summary: "Stripes",
  status: "published",
};
const unknownField = "This field is not declared in the collection.";

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

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function recording(body: unknown, status = 200) {
  const requests: Request[] = [];
  const transport = vi.fn<Fetch>(async (input, init) => {
    requests.push(
      input instanceof Request ? new Request(input, init) : new Request(String(input), init),
    );
    return reply(body, status);
  });
  return { client: createClient({ ...options(), fetch: transport }), transport, requests };
}

function failing(make: () => Response | Promise<Response>) {
  const transport = vi.fn<Fetch>(async () => make());
  return { client: createClient({ ...options(), fetch: transport }), transport };
}

type Client = ReturnType<typeof recording>["client"];

function call(
  client: Client,
  method: "update" | "delete" | "list",
  args: unknown[],
): Promise<unknown> {
  return Reflect.apply(Reflect.get(client.articles, method), client.articles, args);
}

async function expectHeaders(request: Request, json: boolean) {
  expect(request.headers.get("authorization")).toBe("Bearer server-only-secret");
  expect(request.headers.get("aircastle-schema")).toMatch(/^v1:[a-f0-9]{64}$/);
  if (json) expect(request.headers.get("content-type")).toMatch(/^application\/json(?:;|$)/);
}

describe("R11 R13 client update request", () => {
  test("sends PATCH to the document with changes and unset and returns the document", async () => {
    const updated = { ...article, title: "X" };
    const { client, transport, requests } = recording({ ok: true, data: updated });
    expect(await client.articles.update(id, { title: "X" }, { unset: ["summary"] })).toEqual({
      ok: true,
      data: updated,
    });
    expect(transport).toHaveBeenCalledTimes(1);
    const [request] = requests;
    expect(request!.method).toBe("PATCH");
    expect(request!.url).toBe(`${endpoint}/${id}`);
    await expectHeaders(request!, true);
    expect(await request!.json()).toEqual({ changes: { title: "X" }, unset: ["summary"] });
  });

  test("without options sends the changes and an omitted or empty unset", async () => {
    const { client, requests } = recording({ ok: true, data: article });
    expect(await client.articles.update(id, { title: "Hello" })).toEqual({
      ok: true,
      data: article,
    });
    expect([
      { changes: { title: "Hello" } },
      { changes: { title: "Hello" }, unset: [] },
    ]).toContainEqual(await requests[0]!.json());
  });

  test("sends unset names unchanged and in order", async () => {
    const { client, requests } = recording({ ok: true, data: article });
    expect(await client.articles.update(id, {}, { unset: ["status", "summary"] })).toEqual({
      ok: true,
      data: article,
    });
    expect(await requests[0]!.json()).toEqual({ changes: {}, unset: ["status", "summary"] });
  });

  test("treats undefined values in changes as omitted", async () => {
    const { client, requests } = recording({ ok: true, data: article });
    expect(
      await client.articles.update(id, { title: "Hello", summary: undefined, status: undefined }),
    ).toEqual({ ok: true, data: article });
    const sent: unknown = await requests[0]!.json();
    expect(sent).toHaveProperty("changes", { title: "Hello" });
  });

  test("an undefined change does not count as a name in both lists", async () => {
    const { client, requests } = recording({ ok: true, data: article });
    expect(
      await client.articles.update(id, { summary: undefined }, { unset: ["summary"] }),
    ).toEqual({
      ok: true,
      data: article,
    });
    expect(await requests[0]!.json()).toEqual({ changes: {}, unset: ["summary"] });
  });

  test("checks only supplied fields locally, so a partial change is sent", async () => {
    const { client, requests } = recording({ ok: true, data: { ...article, summary: "Short" } });
    expect(await client.articles.update(id, { summary: "Short" })).toEqual({
      ok: true,
      data: { ...article, summary: "Short" },
    });
    expect(await requests[0]!.json()).toHaveProperty("changes", { summary: "Short" });
  });

  test("sends the changes and unset as they were when update was called", async () => {
    const { client, requests } = recording({ ok: true, data: article });
    const changes: { title?: string; summary?: string } = { title: "Hello" };
    const unset: ("summary" | "status")[] = ["summary"];
    const pending = client.articles.update(id, changes, { unset });
    changes.title = "Changed";
    changes.summary = "Added";
    unset.push("status");
    await pending;
    expect(await requests[0]!.json()).toEqual({ changes: { title: "Hello" }, unset: ["summary"] });
  });

  test("returns the lowercase id the server returns for an uppercase request id", async () => {
    const updated = { ...article, id: lowerId };
    const { client, transport, requests } = recording({ ok: true, data: updated });
    expect(await client.articles.update(upperId, { title: "Hello" })).toEqual({
      ok: true,
      data: updated,
    });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(requests[0]!.url).toBe(`${endpoint}/${lowerId}`);
  });

  test.each([
    ["malformed id", ["not-a-uuid", { title: "X" }]],
    ["braced id", [`{${id}}`, { title: "X" }]],
    ["non-string id", [42, { title: "X" }]],
    ["name in both lists", [id, { summary: "x" }, { unset: ["summary"] }]],
    ["null change in both lists", [id, { summary: null }, { unset: ["status", "summary"] }]],
    ["unknown option key", [id, { title: "X" }, { unsett: ["summary"] }]],
    ["null unset", [id, { title: "X" }, { unset: null }]],
    ["string unset", [id, { title: "X" }, { unset: "summary" }]],
  ])("returns invalid_request locally for a %s", async (_name, args) => {
    const { client, transport } = recording({ ok: true, data: article });
    expect(await call(client, "update", args)).toEqual({
      ok: false,
      error: { code: "invalid_request" },
    });
    expect(transport).not.toHaveBeenCalled();
  });

  test.each([
    [
      "an undeclared field",
      { body: "x" },
      [{ code: "unknown_field", path: ["body"], message: unknownField }],
    ],
    [
      "the system id",
      { id: otherId },
      [{ code: "unknown_field", path: ["id"], message: unknownField }],
    ],
    [
      "a wrong value type",
      { title: 42 },
      [
        {
          code: "invalid_type",
          path: ["title"],
          expected: "string",
          received: "number",
          message: "Expected a text value.",
        },
      ],
    ],
  ])("returns validation_failed locally for %s", async (_name, changes, issues) => {
    const { client, transport } = recording({ ok: true, data: article });
    expect(await call(client, "update", [id, changes])).toEqual({
      ok: false,
      error: { code: "validation_failed", issues },
    });
    expect(transport).not.toHaveBeenCalled();
  });
});

describe("R11 R13 client delete request", () => {
  test("sends DELETE without a body and returns the id", async () => {
    const { client, transport, requests } = recording({ ok: true, data: { id } });
    expect(await client.articles.delete(id)).toEqual({ ok: true, data: { id } });
    expect(transport).toHaveBeenCalledTimes(1);
    const [request] = requests;
    expect(request!.method).toBe("DELETE");
    expect(request!.url).toBe(`${endpoint}/${id}`);
    await expectHeaders(request!, false);
    expect(await request!.text()).toBe("");
  });

  test("returns the lowercase id the server returns for an uppercase request id", async () => {
    const { client, requests } = recording({ ok: true, data: { id: lowerId } });
    expect(await client.articles.delete(upperId)).toEqual({ ok: true, data: { id: lowerId } });
    expect(requests[0]!.url).toBe(`${endpoint}/${lowerId}`);
  });

  test.each([["not-a-uuid"], [`{${id}}`], [42], [undefined]])(
    "returns invalid_request locally for id %s",
    async (value) => {
      const { client, transport } = recording({ ok: true, data: { id } });
      expect(await call(client, "delete", [value])).toEqual({
        ok: false,
        error: { code: "invalid_request" },
      });
      expect(transport).not.toHaveBeenCalled();
    },
  );

  test("returns the referenced error with its details", async () => {
    const error = { code: "referenced", collection: "articles", field: "author" };
    const { client, transport } = recording({ ok: false, error }, 409);
    expect(await client.articles.delete(id)).toEqual({ ok: false, error });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  test("returns not_found for a missing document", async () => {
    const { client } = recording({ ok: false, error: { code: "not_found" } }, 404);
    expect(await client.articles.delete(id)).toEqual({ ok: false, error: { code: "not_found" } });
  });
});

describe("R11 R13 client list request", () => {
  const page = { documents: [second, article], next: "opaque-cursor" };

  test("sends POST to documents/query with the query as JSON and returns the page", async () => {
    const { client, transport, requests } = recording({ ok: true, data: page });
    const query = {
      where: { status: "published" as const, title: { contains: "a", not: "Apple" } },
      sort: "-title" as const,
      limit: 2,
      cursor: "previous-cursor",
    };
    expect(await client.articles.list(query)).toEqual({ ok: true, data: page });
    expect(transport).toHaveBeenCalledTimes(1);
    const [request] = requests;
    expect(request!.method).toBe("POST");
    expect(request!.url).toBe(`${endpoint}/query`);
    await expectHeaders(request!, true);
    expect(await request!.json()).toEqual(query);
  });

  test("without a query sends an empty JSON object", async () => {
    const empty = { documents: [], next: null };
    const { client, requests } = recording({ ok: true, data: empty });
    expect(await client.articles.list()).toEqual({ ok: true, data: empty });
    expect(await requests[0]!.json()).toEqual({});
  });

  test("returns a last page with next null", async () => {
    const last = { documents: [article], next: null };
    const { client } = recording({ ok: true, data: last });
    expect(await client.articles.list({ limit: 1 })).toEqual({ ok: true, data: last });
  });

  test.each([
    ["limit 0", { limit: 0 }],
    ["limit 101", { limit: 101 }],
    ["fractional limit", { limit: 1.5 }],
    ["NaN limit", { limit: Number.NaN }],
    ["string limit", { limit: "20" }],
    ["double dash sort", { sort: "--title" }],
    ["dotted sort", { sort: "seo.title" }],
    ["empty sort", { sort: "" }],
    ["array where", { where: [] }],
    ["null where", { where: null }],
    ["string where", { where: "status" }],
  ])("returns invalid_request locally for %s", async (_name, query) => {
    const { client, transport } = recording({ ok: true, data: page });
    expect(await call(client, "list", [query])).toEqual({
      ok: false,
      error: { code: "invalid_request" },
    });
    expect(transport).not.toHaveBeenCalled();
  });

  test("sends the query as it was when list was called", async () => {
    const { client, requests } = recording({ ok: true, data: page });
    const where: { status?: "draft" | "published"; title?: { contains?: string; not?: string } } = {
      status: "published",
      title: { contains: "a" },
    };
    const query: { where: typeof where; limit?: number; sort?: "title" } = { where, limit: 2 };
    const pending = client.articles.list(query);
    where.status = "draft";
    where.title!.contains = "z";
    where.title!.not = "Apple";
    query.limit = 5;
    query.sort = "title";
    await pending;
    expect(await requests[0]!.json()).toEqual({
      where: { status: "published", title: { contains: "a" } },
      limit: 2,
    });
  });

  const circular: Record<string, unknown> = { contains: "a" };
  circular.self = circular;
  test.each([
    ["a bigint value", { where: { title: 1n } }],
    ["a circular object", { where: { title: circular } }],
    ["a function value", { where: { title: () => "Hello" } }],
    ["a symbol value", { where: { title: Symbol("Hello") } }],
    ["a Date value", { where: { title: new Date(0) } }],
    ["a Map value", { where: { title: new Map([["is", "Hello"]]) } }],
    ["an infinite number", { where: { title: { contains: Number.POSITIVE_INFINITY } } }],
    ["a nested function", { where: { title: { in: ["a", () => "b"] } } }],
  ])("returns invalid_request without sending for a where with %s", async (_name, query) => {
    const { client, transport } = recording({ ok: true, data: page });
    await expect(call(client, "list", [query])).resolves.toEqual({
      ok: false,
      error: { code: "invalid_request" },
    });
    expect(transport).not.toHaveBeenCalled();
  });

  test("returns a fresh invalid_request result on each call", async () => {
    const { client } = recording({ ok: true, data: page });
    const first = await call(client, "list", [{ limit: 0 }]);
    expect(first).toEqual({ ok: false, error: { code: "invalid_request" } });
    Reflect.set(first as object, "ok", true);
    Reflect.set(Reflect.get(first as object, "error"), "code", "changed");
    for (const method of ["list", "update", "delete"] as const) {
      const args = method === "list" ? [{ limit: 0 }] : ["not-a-uuid", {}];
      expect(await call(client, method, args)).toEqual({
        ok: false,
        error: { code: "invalid_request" },
      });
    }
  });

  test("returns a server invalid_request unchanged", async () => {
    const { client } = recording({ ok: false, error: { code: "invalid_request" } }, 400);
    expect(await client.articles.list({ sort: "title" })).toEqual({
      ok: false,
      error: { code: "invalid_request" },
    });
  });
});

describe("R11 R13 lost and malformed responses", () => {
  const writes = {
    update: (client: Client) => client.articles.update(id, { title: "Hello" }),
    delete: (client: Client) => client.articles.delete(id),
  };
  const writeSuccess = { update: article, delete: { id } };

  test.each(["update", "delete"] as const)(
    "a lost %s response is unknown_write_outcome and is not retried",
    async (operation) => {
      const { client, transport } = failing(() => {
        throw new DOMException("reply lost", "AbortError");
      });
      expect(await writes[operation](client)).toEqual({
        ok: false,
        error: { code: "unknown_write_outcome" },
      });
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );

  test("a lost list response is transport_error and is not retried", async () => {
    const { client, transport } = failing(() => {
      throw new TypeError("connection reset");
    });
    expect(await client.articles.list()).toEqual({ ok: false, error: { code: "transport_error" } });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  test.each(["update", "delete"] as const)(
    "invalid JSON in a %s response is unknown_write_outcome",
    async (operation) => {
      const { client } = failing(() => new Response("{", { status: 200 }));
      expect(await writes[operation](client)).toEqual({
        ok: false,
        error: { code: "unknown_write_outcome" },
      });
    },
  );

  test("invalid JSON in a list response is transport_error", async () => {
    const { client } = failing(() => new Response("{", { status: 200 }));
    expect(await client.articles.list()).toEqual({ ok: false, error: { code: "transport_error" } });
  });

  test.each([201, 202, 203])(
    "write success with status %i is unknown_write_outcome",
    async (status) => {
      for (const operation of ["update", "delete"] as const) {
        const { client } = recording({ ok: true, data: writeSuccess[operation] }, status);
        expect(await writes[operation](client)).toEqual({
          ok: false,
          error: { code: "unknown_write_outcome" },
        });
      }
    },
  );

  test.each(["update", "delete"] as const)(
    "a %s success for a different document id is unknown_write_outcome",
    async (operation) => {
      const data = { update: { ...article, id: otherId }, delete: { id: otherId } };
      const { client } = recording({ ok: true, data: data[operation] });
      expect(await writes[operation](client)).toEqual({
        ok: false,
        error: { code: "unknown_write_outcome" },
      });
    },
  );

  test.each([201, 203])("list success with status %i is transport_error", async (status) => {
    const { client } = recording({ ok: true, data: { documents: [], next: null } }, status);
    expect(await client.articles.list()).toEqual({ ok: false, error: { code: "transport_error" } });
  });

  test.each([
    ["missing envelope", {}],
    ["missing document", { ok: true }],
    ["missing id", { ok: true, data: { title: "Hello", slug: "hello", status: "draft" } }],
    ["malformed id", { ok: true, data: { ...article, id: "not-a-uuid" } }],
    ["wrong field type", { ok: true, data: { ...article, title: 42 } }],
    ["unknown returned field", { ok: true, data: { ...article, private: "secret" } }],
    ["unknown error code", { ok: false, error: { code: "anything" } }],
  ])("a malformed update response (%s) is unknown_write_outcome", async (_name, body) => {
    const { client } = recording(body, "ok" in body && body.ok === false ? 400 : 200);
    expect(await client.articles.update(id, { title: "Hello" })).toEqual({
      ok: false,
      error: { code: "unknown_write_outcome" },
    });
  });

  test.each([
    ["missing envelope", {}],
    ["missing data", { ok: true }],
    ["missing id", { ok: true, data: {} }],
    ["malformed id", { ok: true, data: { id: "not-a-uuid" } }],
    ["numeric id", { ok: true, data: { id: 42 } }],
    [
      "referenced without field",
      { ok: false, error: { code: "referenced", collection: "articles" } },
    ],
    [
      "referenced without collection",
      { ok: false, error: { code: "referenced", field: "author" } },
    ],
  ])("a malformed delete response (%s) is unknown_write_outcome", async (_name, body) => {
    const { client } = recording(body, "ok" in body && body.ok === false ? 409 : 200);
    expect(await client.articles.delete(id)).toEqual({
      ok: false,
      error: { code: "unknown_write_outcome" },
    });
  });

  test.each([
    ["missing envelope", {}],
    ["missing data", { ok: true }],
    ["missing next", { ok: true, data: { documents: [] } }],
    ["numeric next", { ok: true, data: { documents: [], next: 5 } }],
    ["missing documents", { ok: true, data: { next: null } }],
    ["documents not a list", { ok: true, data: { documents: article, next: null } }],
    [
      "document with a malformed id",
      { ok: true, data: { documents: [{ ...article, id: "x" }], next: null } },
    ],
    [
      "document with a wrong field type",
      { ok: true, data: { documents: [article, { ...second, title: 42 }], next: null } },
    ],
    [
      "document with an unknown field",
      { ok: true, data: { documents: [{ ...article, private: "secret" }], next: null } },
    ],
    ["unknown error code", { ok: false, error: { code: "anything" } }],
  ])("a malformed list response (%s) is transport_error", async (_name, body) => {
    const { client } = recording(body, "ok" in body && body.ok === false ? 400 : 200);
    expect(await client.articles.list()).toEqual({ ok: false, error: { code: "transport_error" } });
  });
});
