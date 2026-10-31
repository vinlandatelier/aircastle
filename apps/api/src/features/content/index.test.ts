import { describe, expect, test } from "vite-plus/test";
import pino from "pino";
import type { ContentError, Permission, Result } from "@aircastle/contracts";
import {
  createService,
  type Access,
  type ContentService,
  type ContentStore,
} from "@aircastle/core";
import { cmsErrorReporter, createApp } from "../../app.ts";

const project = "11111111-1111-4111-8111-111111111111";
const documentId = "22222222-2222-4222-8222-222222222222";
const fingerprint = `v1:${"a".repeat(64)}`;
const document = { id: documentId, title: "Hello", slug: "hello" };
const base = `/api/projects/${project}`;
const documents = `${base}/collections/articles/documents`;
const authorization = "Bearer test-secret";

function captureLogs() {
  const lines: string[] = [];
  const logger = pino({ level: "info" }, { write: (line) => lines.push(line) });
  return { logger, records: () => lines.map((line) => JSON.parse(line)) };
}

function fixture(error?: ContentError) {
  const calls: { operation: string; access: Access; args: unknown[] }[] = [];
  const outcome = <Data>(
    operation: string,
    access: Access,
    data: Data,
    args: unknown[] = [],
  ): Result<Data> => {
    calls.push({ operation, access, args });
    if (access.apiKey !== "test-secret") return { ok: false, error: { code: "unauthorized" } };
    return error ? { ok: false, error } : { ok: true, data };
  };
  const cms: ContentService = {
    authorize: async (access, permission: Permission) =>
      outcome("authorize", access, null, [permission]),
    schema: async (access) => outcome("schema", access, { revision: null, collections: [] }),
    publish: async (access, request) =>
      outcome("publish", access, { revision: "revision-1", contracts: { articles: fingerprint } }, [
        request,
      ]),
    create: async (access, collection, contract, input) =>
      outcome("create", access, document, [collection, contract, input]),
    findById: async (access, collection, contract, id) =>
      outcome("read", access, document, [collection, contract, id]),
    update: async (access, collection, contract, id, request) =>
      outcome("update", access, { ...document, id: id.toLowerCase() }, [
        collection,
        contract,
        id,
        request,
      ]),
    delete: async (access, collection, contract, id) =>
      outcome("delete", access, { id: id.toLowerCase() }, [collection, contract, id]),
    list: async (access, collection, contract, query) =>
      outcome("list", access, { documents: [document], next: null }, [collection, contract, query]),
  };
  const app = createApp({ logger: pino({ level: "silent" }), cms });
  const headers = {
    authorization,
    "aircastle-schema": fingerprint,
    "content-type": "application/json",
  };
  return { app, cms, calls, headers };
}

test("content routes preserve existing health behavior", async () => {
  const { app } = fixture();
  const response = await app.request("/api/health");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "ok" });
});

test("create translates project credentials, contract and document without an extra envelope", async () => {
  const { app, calls, headers } = fixture();
  const input = { title: "Hello", slug: "hello" };
  const response = await app.request(documents, {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  });
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ ok: true, data: document });
  expect(calls.filter((call) => call.operation === "create")).toEqual([
    {
      operation: "create",
      access: { project, apiKey: "test-secret" },
      args: ["articles", fingerprint, input],
    },
  ]);
});

test("read uses GET and the document identifier", async () => {
  const { app, calls, headers } = fixture();
  const response = await app.request(`${documents}/${documentId}`, { headers });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, data: document });
  expect(calls.find((call) => call.operation === "read")?.args).toEqual([
    "articles",
    fingerprint,
    documentId,
  ]);
});

test("R13 read forwards a case-insensitive path id in lowercase", async () => {
  const { app, calls, headers } = fixture();
  const response = await app.request(`${documents}/${upperDocumentId}`, { headers });
  expect(response.status).toBe(200);
  expect(calls.find((call) => call.operation === "read")?.args).toEqual([
    "articles",
    fingerprint,
    lowerDocumentId,
  ]);
});

for (const [code, status] of [
  ["invalid_request", 400],
  ["unauthorized", 401],
  ["forbidden", 403],
  ["not_found", 404],
  ["schema_mismatch", 409],
  ["schema_conflict", 409],
  ["migration_required", 409],
  ["payload_too_large", 413],
  ["internal_error", 500],
  ["unavailable", 503],
] as const) {
  test(`maps ${code} to HTTP ${status} without changing the domain error`, async () => {
    const { app, headers } = fixture({ code });
    const response = await app.request(documents, { method: "POST", headers, body: "{}" });
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ ok: false, error: { code } });
  });
}

test("preserves all validation issue details and order", async () => {
  const error = {
    code: "validation_failed",
    issues: [
      { code: "required", path: ["title"], message: "Required" },
      {
        code: "too_long",
        path: ["slug"],
        maximum: 2,
        actual: 3,
        unit: "graphemes",
        message: "Too long",
      },
    ],
  } as const;
  const { app, headers } = fixture(error);
  const response = await app.request(documents, { method: "POST", headers, body: "{}" });
  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({ ok: false, error });
});

test("preserves the database-detected uniqueness field", async () => {
  const { app, headers } = fixture({ code: "unique_conflict", field: "slug" });
  const response = await app.request(documents, { method: "POST", headers, body: "{}" });
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({
    ok: false,
    error: { code: "unique_conflict", field: "slug" },
  });
});

test("R11 maps referenced to HTTP 409 with its collection and field", async () => {
  const { app, headers } = fixture({ code: "referenced", collection: "articles", field: "author" });
  const response = await app.request(documents, { method: "POST", headers, body: "{}" });
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({
    ok: false,
    error: { code: "referenced", collection: "articles", field: "author" },
  });
});

for (const value of [
  undefined,
  "Basic test-secret",
  "Bearer",
  "Bearer ",
  "Bearer test-secret extra",
]) {
  test(`rejects malformed authorization ${String(value)}`, async () => {
    const { app, headers } = fixture();
    const requestHeaders = new Headers(headers);
    if (value === undefined) requestHeaders.delete("authorization");
    else requestHeaders.set("authorization", value);
    const response = await app.request(documents, {
      method: "POST",
      headers: requestHeaders,
      body: "{}",
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: { code: "unauthorized" } });
  });
}

for (const value of [undefined, "", "wrong", `v1:${"g".repeat(64)}`, `v1:${"a".repeat(63)}`]) {
  test(`rejects a missing or malformed contract header ${String(value)}`, async () => {
    const { app, calls, headers } = fixture();
    const requestHeaders = new Headers(headers);
    if (value === undefined) requestHeaders.delete("aircastle-schema");
    else requestHeaders.set("aircastle-schema", value);
    const response = await app.request(documents, {
      method: "POST",
      headers: requestHeaders,
      body: "{}",
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: { code: "invalid_request" } });
    expect(calls.filter((call) => call.operation === "create")).toHaveLength(0);
  });
}

for (const body of ["{", "{broken}", "[", "undefined"]) {
  test(`malformed JSON fails before a content write: ${body}`, async () => {
    const { app, calls, headers } = fixture();
    const response = await app.request(documents, { method: "POST", headers, body });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: { code: "invalid_request" } });
    expect(calls.filter((call) => call.operation === "create")).toHaveLength(0);
  });
}

test("JSON duplicate keys use the last value", async () => {
  const { app, calls, headers } = fixture();
  const response = await app.request(documents, {
    method: "POST",
    headers,
    body: '{"title":"first","title":"last"}',
  });
  expect(response.status).toBe(201);
  expect(calls.find((call) => call.operation === "create")?.args[2]).toEqual({ title: "last" });
});

for (const unsupported of [
  { "content-type": "text/plain" },
  { "content-type": "application/json", "content-encoding": "gzip" },
]) {
  test(`rejects unsupported representation ${JSON.stringify(unsupported)}`, async () => {
    const { app, calls, headers } = fixture();
    const response = await app.request(documents, {
      method: "POST",
      headers: { ...headers, ...unsupported },
      body: "{}",
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: { code: "invalid_request" } });
    expect(calls.filter((call) => call.operation === "create")).toHaveLength(0);
  });
}

test("byte limit counts UTF-8 bytes rather than JavaScript characters", async () => {
  const { cms, calls, headers } = fixture();
  const body = JSON.stringify({ title: "é" });
  const byteLength = new TextEncoder().encode(body).length;
  const app = createApp({ logger: pino({ level: "silent" }), cms, maxRequestBytes: byteLength });
  const accepted = await app.request(documents, { method: "POST", headers, body });
  expect(accepted.status).toBe(201);
  const tooBig = await app.request(documents, { method: "POST", headers, body: `${body} ` });
  expect(tooBig.status).toBe(413);
  expect(await tooBig.json()).toEqual({ ok: false, error: { code: "payload_too_large" } });
  expect(calls.filter((call) => call.operation === "create")).toHaveLength(1);
});

test("default request limit accepts its exact byte boundary and rejects the next byte", async () => {
  const { app, headers } = fixture();
  const body = JSON.stringify({ title: "x".repeat(1_048_576 - 12) });
  expect(new TextEncoder().encode(body).length).toBe(1_048_576);
  expect((await app.request(documents, { method: "POST", headers, body })).status).toBe(201);
  expect((await app.request(documents, { method: "POST", headers, body: `${body} ` })).status).toBe(
    413,
  );
});

test("schema endpoints translate publication envelopes and revisions", async () => {
  const { app, calls, headers } = fixture();
  const response = await app.request(`${base}/schema`, { headers });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, data: { revision: null, collections: [] } });
  const request = { baseline: null, collections: [] };
  const published = await app.request(`${base}/schema`, {
    method: "POST",
    headers,
    body: JSON.stringify(request),
  });
  expect(published.status).toBe(200);
  expect(await published.json()).toEqual({
    ok: true,
    data: { revision: "revision-1", contracts: { articles: fingerprint } },
  });
  expect(calls.find((call) => call.operation === "publish")?.args).toEqual([request]);
});

const secret = "secret-4b1d";

class StorageDriverError extends Error {}

function failStorageQuery(): never {
  throw Object.assign(
    new StorageDriverError(`insert failed for ${secret}\n    at ${secret}`, {
      cause: new Error(secret),
    }),
    { code: "XX000", query: `select * from keys where key = '${secret}'`, parameters: [secret] },
  );
}

async function expectSanitizedFailure(response: Response, logs: ReturnType<typeof captureLogs>) {
  expect(response.status).toBe(500);
  const body = await response.text();
  expect(JSON.parse(body)).toEqual({ ok: false, error: { code: "internal_error" } });
  const errors = logs.records().flatMap((record) => (record.err ? [record.err] : []));
  expect(errors).toHaveLength(1);
  expect(JSON.stringify(errors[0])).toContain("StorageDriverError");
  expect(errors[0]).toMatchObject({
    code: "XX000",
    stack: expect.stringContaining("failStorageQuery"),
  });
  expect(
    body +
      logs
        .records()
        .map((record) => JSON.stringify(record))
        .join(""),
  ).not.toContain(secret);
}

test("unexpected route failures log a sanitized summary and return a safe envelope", async () => {
  const { cms, headers } = fixture();
  cms.create = async () => failStorageQuery();
  const logs = captureLogs();
  const app = createApp({ logger: logs.logger, cms });
  await expectSanitizedFailure(
    await app.request(documents, { method: "POST", headers, body: "{}" }),
    logs,
  );
});

test("errors the CMS turns into internal_error are logged as a sanitized summary", async () => {
  const store: ContentStore = {
    initialize: async () => {},
    provision: async () => {
      throw new Error("provision is not used here");
    },
    authorize: async () => "authorized",
    transaction: async () => failStorageQuery(),
    close: async () => {},
  };
  const logs = captureLogs();
  const app = createApp({
    logger: logs.logger,
    cms: createService(store, cmsErrorReporter(logs.logger)),
  });
  await expectSanitizedFailure(
    await app.request(`${base}/schema`, { headers: { authorization } }),
    logs,
  );
});

test("a false Content-Length cannot bypass the actual request byte budget", async () => {
  const { cms, headers } = fixture();
  const app = createApp({ logger: pino({ level: "silent" }), cms, maxRequestBytes: 12 });
  const response = await app.request(documents, {
    method: "POST",
    headers: { ...headers, "content-length": "1" },
    body: JSON.stringify({ title: "more than the limit" }),
  });
  expect(response.status).toBe(413);
  expect(await response.json()).toEqual({ ok: false, error: { code: "payload_too_large" } });
});

test("canonicalizes valid project UUID casing before authorization and lookup", async () => {
  const { app, calls, headers } = fixture();
  const upperProject = "ABCDEFAB-1111-4111-8111-ABCDEFABCDEF";
  const response = await app.request(`/api/projects/${upperProject}/schema`, { headers });
  expect(response.status).toBe(200);
  expect(calls.find((call) => call.operation === "schema")?.access).toEqual({
    project: "abcdefab-1111-4111-8111-abcdefabcdef",
    apiKey: "test-secret",
  });
});

for (const endpoint of [documents, `${base}/schema`]) {
  test(`a request without credentials returns 401 on ${endpoint}`, async () => {
    const { app, calls, headers } = fixture();
    const requestHeaders = new Headers(headers);
    requestHeaders.delete("authorization");

    const response = await app.request(endpoint, {
      method: "POST",
      headers: requestHeaders,
      body: "{}",
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: { code: "unauthorized" } });
    expect(calls).toEqual([]);
  });

  test.each([false, true])(
    `oversized streams are cancelled and unlocked on ${endpoint}, cancellation rejects: %s`,
    async (rejectCancellation) => {
      const { cms, calls, headers } = fixture();
      const app = createApp({ logger: pino({ level: "silent" }), cms, maxRequestBytes: 16 });
      let cancelled = false;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(17));
        },
        cancel() {
          cancelled = true;
          if (rejectCancellation) throw new Error("Cancellation failed");
        },
      });
      const request = new Request(`http://localhost${endpoint}`, {
        method: "POST",
        headers,
        body,
        duplex: "half",
      });

      const response = await app.request(request);

      expect(response.status).toBe(413);
      expect(await response.json()).toEqual({ ok: false, error: { code: "payload_too_large" } });
      expect(cancelled).toBe(true);
      expect(body.locked).toBe(false);
      expect(calls).toEqual([]);
    },
  );
}

test("decodes UTF-8 characters split across chunks and releases the request stream", async () => {
  const { app, calls, headers } = fixture();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"title":"'));
      controller.enqueue(new Uint8Array([0xc3]));
      controller.enqueue(new Uint8Array([0xa9]));
      controller.enqueue(new TextEncoder().encode('"}'));
      controller.close();
    },
  });
  const request = new Request(`http://localhost${documents}`, {
    method: "POST",
    headers,
    body,
    duplex: "half",
  });

  const response = await app.request(request);

  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ ok: true, data: document });
  expect(calls.find((call) => call.operation === "create")?.args[2]).toEqual({ title: "é" });
  expect(body.locked).toBe(false);
});

test.each(["invalid UTF-8", "malformed JSON", "read failure"] as const)(
  "rejects %s and releases the request stream without calling the CMS",
  async (failure) => {
    const { app, calls, headers } = fixture();
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (failure === "read failure") throw new Error("Stream read failed");
        controller.enqueue(
          failure === "invalid UTF-8"
            ? new Uint8Array([
                ...new TextEncoder().encode('{"title":"'),
                0xff,
                ...new TextEncoder().encode('"}'),
              ])
            : new TextEncoder().encode("{"),
        );
        controller.close();
      },
    });
    const request = new Request(`http://localhost${documents}`, {
      method: "POST",
      headers,
      body,
      duplex: "half",
    });

    const response = await app.request(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: { code: "invalid_request" } });
    expect(body.locked).toBe(false);
    expect(calls).toEqual([]);
  },
);

const upperDocumentId = "ABCDEF12-2222-4222-8222-ABCDEFABCDEF";
const lowerDocumentId = "abcdef12-2222-4222-8222-abcdefabcdef";
const documentPath = `${documents}/${documentId}`;
const queryPath = `${documents}/query`;
const invalidRequest = { ok: false, error: { code: "invalid_request" } };
const unauthorized = { ok: false, error: { code: "unauthorized" } };

async function expectReply(response: Response, status: number, body: unknown) {
  const json = response.headers.get("content-type")?.startsWith("application/json") ?? false;
  const received: unknown = json ? await response.json() : await response.text();
  expect({ status: response.status, body: received }).toEqual({ status, body });
}

function lifecycleCalls<Call extends { operation: string }>(calls: Call[]) {
  return calls.filter((call) => ["update", "delete", "list"].includes(call.operation));
}

function forwardedId(calls: { operation: string; args: unknown[] }[], operation: string) {
  const id = calls.find((call) => call.operation === operation)?.args[2];
  return typeof id === "string" ? id.toLowerCase() : id;
}

function withoutEmptyWhere(calls: { operation: string; args: unknown[] }[]) {
  return lifecycleCalls(calls).map((call) => {
    const [collection, contract, query] = call.args;
    if (typeof query !== "object" || query === null || !("where" in query)) return call;
    const { where, ...rest } = query as { where: unknown };
    const empty = typeof where === "object" && where !== null && Object.keys(where).length === 0;
    return empty ? { ...call, args: [collection, contract, rest] } : call;
  });
}

function without(headers: Record<string, string>, ...names: string[]) {
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !names.includes(name)));
}

describe("R11 R13 PATCH update route", () => {
  const patch = (
    app: ReturnType<typeof fixture>["app"],
    body: string,
    headers: Headers | Record<string, string>,
  ) => app.request(documentPath, { method: "PATCH", headers, body });

  test.each([
    [
      "changes only",
      { changes: { title: "Hello again" } },
      { changes: { title: "Hello again" }, unset: [] },
    ],
    [
      "changes and unset",
      { changes: { title: "X" }, unset: ["summary"] },
      { changes: { title: "X" }, unset: ["summary"] },
    ],
    ["empty unset same as omitted", { changes: {}, unset: [] }, { changes: {}, unset: [] }],
    ["no changes", { changes: {} }, { changes: {}, unset: [] }],
    [
      "undeclared names and values left to the service",
      { changes: { id: "x", body: 42, title: null }, unset: ["missing", "slug"] },
      { changes: { id: "x", body: 42, title: null }, unset: ["missing", "slug"] },
    ],
  ])("returns 200 and forwards exactly the parsed update: %s", async (_name, body, forwarded) => {
    const { app, calls, headers } = fixture();
    await expectReply(await patch(app, JSON.stringify(body), headers), 200, {
      ok: true,
      data: document,
    });
    expect(lifecycleCalls(calls)).toEqual([
      {
        operation: "update",
        access: { project, apiKey: "test-secret" },
        args: ["articles", fingerprint, documentId, forwarded],
      },
    ]);
  });

  test.each([
    ["array body", "[]"],
    ["null body", "null"],
    ["string body", '"changes"'],
    ["missing changes", '{"unset":[]}'],
    ["empty object", "{}"],
    ["unknown top-level key", '{"changes":{},"extra":1}'],
    ["unknown key beside unset", '{"changes":{},"unset":[],"set":{}}'],
    ["null changes", '{"changes":null}'],
    ["array changes", '{"changes":[]}'],
    ["string changes", '{"changes":"title"}'],
    ["unset null", '{"changes":{},"unset":null}'],
    ["unset string", '{"changes":{},"unset":"summary"}'],
    ["unset object", '{"changes":{},"unset":{}}'],
    ["unset with a number", '{"changes":{},"unset":[1]}'],
    ["unset with null", '{"changes":{},"unset":[null]}'],
    ["duplicate unset names", '{"changes":{},"unset":["summary","summary"]}'],
    ["name in both lists", '{"changes":{"summary":"x"},"unset":["summary"]}'],
    ["name in both lists with null", '{"changes":{"summary":null},"unset":["title","summary"]}'],
    ["malformed JSON", "{"],
  ])("rejects %s with 400 before the service", async (_name, body) => {
    const { app, calls, headers } = fixture();
    await expectReply(await patch(app, body, headers), 400, invalidRequest);
    expect(calls).toEqual([]);
  });

  test.each([
    ["malformed JSON", "{"],
    ["missing changes", '{"unset":[]}'],
    ["unset null", '{"changes":{},"unset":null}'],
    ["name in both lists", '{"changes":{"summary":"x"},"unset":["summary"]}'],
  ])("checks body syntax before the bearer: %s", async (_name, body) => {
    const { app, calls, headers } = fixture();
    await expectReply(
      await patch(app, body, without(headers, "authorization")),
      400,
      invalidRequest,
    );
    expect(calls).toEqual([]);
  });

  test("checks the request size before the bearer", async () => {
    const { cms, calls, headers } = fixture();
    const app = createApp({ logger: pino({ level: "silent" }), cms, maxRequestBytes: 16 });
    const body = JSON.stringify({ changes: { title: "longer than sixteen bytes" } });
    await expectReply(await patch(app, body, without(headers, "authorization")), 413, {
      ok: false,
      error: { code: "payload_too_large" },
    });
    expect(calls).toEqual([]);
  });

  test.each([
    ["text/plain", { "content-type": "text/plain" }],
    ["gzip encoding", { "content-encoding": "gzip" }],
  ])("rejects unsupported representation %s", async (_name, extra) => {
    const { app, calls, headers } = fixture();
    await expectReply(
      await patch(app, '{"changes":{}}', { ...headers, ...extra }),
      400,
      invalidRequest,
    );
    expect(calls).toEqual([]);
  });

  test.each([
    ["malformed id", `${documents}/not-a-uuid`],
    ["malformed project", `/api/projects/not-a-uuid/collections/articles/documents/${documentId}`],
    ["malformed collection", `${base}/collections/bad-name/documents/${documentId}`],
  ])("checks the bearer before a %s", async (_name, path) => {
    const { app, calls, headers } = fixture();
    const response = await app.request(path, {
      method: "PATCH",
      headers: without(headers, "authorization", "aircastle-schema"),
      body: '{"changes":{}}',
    });
    await expectReply(response, 401, unauthorized);
    expect(calls).toEqual([]);
  });

  test.each([
    ["malformed id", `${documents}/not-a-uuid`, {}],
    ["id with braces", `${documents}/{${documentId}}`, {}],
    [
      "malformed project",
      `/api/projects/not-a-uuid/collections/articles/documents/${documentId}`,
      {},
    ],
    ["malformed collection", `${base}/collections/bad-name/documents/${documentId}`, {}],
    ["missing contract header", documentPath, { "aircastle-schema": undefined }],
    ["malformed contract header", documentPath, { "aircastle-schema": `v1:${"g".repeat(64)}` }],
    ["short contract header", documentPath, { "aircastle-schema": `v1:${"a".repeat(63)}` }],
  ])(
    "returns 400 for a %s before checking the key",
    async (_name, path, overrides: Record<string, string | undefined>) => {
      const { app, calls, headers } = fixture();
      const requestHeaders = new Headers({ ...headers, authorization: "Bearer wrong-key" });
      for (const [name, value] of Object.entries(overrides)) {
        if (value === undefined) requestHeaders.delete(name);
        else requestHeaders.set(name, value);
      }
      const response = await app.request(path, {
        method: "PATCH",
        headers: requestHeaders,
        body: '{"changes":{}}',
      });
      await expectReply(response, 400, invalidRequest);
      expect(calls).toEqual([]);
    },
  );

  test("R13 forwards a case-insensitive path id and returns the lowercase id", async () => {
    const { app, calls, headers } = fixture();
    const response = await app.request(`${documents}/${upperDocumentId}`, {
      method: "PATCH",
      headers,
      body: '{"changes":{"title":"X"}}',
    });
    await expectReply(response, 200, { ok: true, data: { ...document, id: lowerDocumentId } });
    expect(lifecycleCalls(calls)).toEqual([
      {
        operation: "update",
        access: { project, apiKey: "test-secret" },
        args: ["articles", fingerprint, expect.any(String), { changes: { title: "X" }, unset: [] }],
      },
    ]);
    expect(forwardedId(calls, "update")).toBe(lowerDocumentId);
  });

  test.each([
    [{ code: "unauthorized" }, 401],
    [{ code: "forbidden" }, 403],
    [{ code: "not_found" }, 404],
    [{ code: "schema_mismatch" }, 409],
    [{ code: "unique_conflict", field: "slug" }, 409],
    [
      {
        code: "validation_failed",
        issues: [
          {
            code: "unknown_field",
            path: ["body"],
            message: "This field is not declared in the collection.",
          },
        ],
      },
      422,
    ],
    [{ code: "internal_error" }, 500],
  ] as const)("returns the service error %o with its status", async (error, status) => {
    const { app, headers } = fixture(error);
    await expectReply(await patch(app, '{"changes":{}}', headers), status, { ok: false, error });
  });
});

describe("R11 R13 DELETE route", () => {
  test("returns 200 with the deleted id and forwards collection, contract and id", async () => {
    const { app, calls, headers } = fixture();
    const response = await app.request(documentPath, {
      method: "DELETE",
      headers: without(headers, "content-type"),
    });
    await expectReply(response, 200, { ok: true, data: { id: documentId } });
    expect(lifecycleCalls(calls)).toEqual([
      {
        operation: "delete",
        access: { project, apiKey: "test-secret" },
        args: ["articles", fingerprint, documentId],
      },
    ]);
  });

  test.each([
    ["malformed JSON", { "content-type": "application/json" }, "{"],
    ["plain text", { "content-type": "text/plain" }, "anything"],
    ["gzip encoding", { "content-type": "application/json", "content-encoding": "gzip" }, "{}"],
  ])("ignores a %s body", async (_name, extra, body) => {
    const { app, calls, headers } = fixture();
    const response = await app.request(documentPath, {
      method: "DELETE",
      headers: { ...without(headers, "content-type"), ...extra },
      body,
    });
    await expectReply(response, 200, { ok: true, data: { id: documentId } });
    expect(lifecycleCalls(calls)).toEqual([
      {
        operation: "delete",
        access: { project, apiKey: "test-secret" },
        args: ["articles", fingerprint, documentId],
      },
    ]);
  });

  test("R13 forwards a case-insensitive path id and returns the lowercase id", async () => {
    const { app, calls, headers } = fixture();
    const response = await app.request(`${documents}/${upperDocumentId}`, {
      method: "DELETE",
      headers,
    });
    await expectReply(response, 200, { ok: true, data: { id: lowerDocumentId } });
    expect(lifecycleCalls(calls)).toEqual([
      {
        operation: "delete",
        access: { project, apiKey: "test-secret" },
        args: ["articles", fingerprint, expect.any(String)],
      },
    ]);
    expect(forwardedId(calls, "delete")).toBe(lowerDocumentId);
  });

  test.each([
    ["missing bearer", documentPath],
    ["missing bearer and malformed id", `${documents}/not-a-uuid`],
    [
      "missing bearer and malformed project",
      `/api/projects/x/collections/articles/documents/${documentId}`,
    ],
    [
      "missing bearer and malformed collection",
      `${base}/collections/bad-name/documents/${documentId}`,
    ],
  ])("returns 401 for a %s", async (_name, path) => {
    const { app, calls, headers } = fixture();
    const response = await app.request(path, {
      method: "DELETE",
      headers: without(headers, "authorization", "aircastle-schema"),
    });
    await expectReply(response, 401, unauthorized);
    expect(calls).toEqual([]);
  });

  test.each([
    ["malformed id", `${documents}/not-a-uuid`, {}],
    ["malformed project", `/api/projects/x/collections/articles/documents/${documentId}`, {}],
    ["malformed collection", `${base}/collections/bad-name/documents/${documentId}`, {}],
    ["missing contract header", documentPath, { "aircastle-schema": undefined }],
    ["malformed contract header", documentPath, { "aircastle-schema": "wrong" }],
  ])(
    "returns 400 for a %s before checking the key",
    async (_name, path, overrides: Record<string, string | undefined>) => {
      const { app, calls, headers } = fixture();
      const requestHeaders = new Headers({ ...headers, authorization: "Bearer wrong-key" });
      for (const [name, value] of Object.entries(overrides)) {
        if (value === undefined) requestHeaders.delete(name);
        else requestHeaders.set(name, value);
      }
      await expectReply(
        await app.request(path, { method: "DELETE", headers: requestHeaders }),
        400,
        invalidRequest,
      );
      expect(calls).toEqual([]);
    },
  );

  test.each([
    [{ code: "referenced", collection: "articles", field: "author" }, 409],
    [{ code: "not_found" }, 404],
    [{ code: "schema_mismatch" }, 409],
    [{ code: "forbidden" }, 403],
    [{ code: "unauthorized" }, 401],
  ] as const)("returns the service error %o with its status", async (error, status) => {
    const { app, headers } = fixture(error);
    await expectReply(await app.request(documentPath, { method: "DELETE", headers }), status, {
      ok: false,
      error,
    });
  });
});

describe("R11 R13 GET list route", () => {
  const list = (
    app: ReturnType<typeof fixture>["app"],
    search: string,
    headers: Record<string, string>,
  ) => app.request(`${documents}${search}`, { headers: without(headers, "content-type") });
  const page = { ok: true, data: { documents: [document], next: null } };

  test("returns 200 with the page and forwards every parsed parameter", async () => {
    const { app, calls, headers } = fixture();
    const where = encodeURIComponent(
      JSON.stringify({ status: "published", title: { contains: "a" } }),
    );
    await expectReply(await list(app, `?where=${where}&sort=-title&limit=2`, headers), 200, page);
    expect(lifecycleCalls(calls)).toEqual([
      {
        operation: "list",
        access: { project, apiKey: "test-secret" },
        args: [
          "articles",
          fingerprint,
          { where: { status: "published", title: { contains: "a" } }, sort: "-title", limit: 2 },
        ],
      },
    ]);
  });

  test("forwards an empty query when no parameter is given", async () => {
    const { app, calls, headers } = fixture();
    await expectReply(await list(app, "", headers), 200, page);
    expect(lifecycleCalls(calls)).toEqual([
      {
        operation: "list",
        access: { project, apiKey: "test-secret" },
        args: ["articles", fingerprint, {}],
      },
    ]);
  });

  test("treats where {} the same as no where", async () => {
    const empty = fixture();
    await expectReply(await list(empty.app, "?where=%7B%7D&limit=5", empty.headers), 200, page);
    const none = fixture();
    await expectReply(await list(none.app, "?limit=5", none.headers), 200, page);
    expect(withoutEmptyWhere(empty.calls)).toEqual(lifecycleCalls(none.calls));
    expect(lifecycleCalls(none.calls)).toHaveLength(1);
  });

  test.each([
    ["1", 1],
    ["9", 9],
    ["20", 20],
    ["99", 99],
    ["100", 100],
  ])("accepts limit %s", async (limit, parsed) => {
    const { app, calls, headers } = fixture();
    await expectReply(await list(app, `?limit=${limit}`, headers), 200, page);
    expect(lifecycleCalls(calls)).toEqual([
      {
        operation: "list",
        access: { project, apiKey: "test-secret" },
        args: ["articles", fingerprint, { limit: parsed }],
      },
    ]);
  });

  test.each(["title", "-title", "_private", "-A_1"])("accepts sort %s", async (sort) => {
    const { app, calls, headers } = fixture();
    await expectReply(await list(app, `?sort=${encodeURIComponent(sort)}`, headers), 200, page);
    expect(lifecycleCalls(calls)).toEqual([
      {
        operation: "list",
        access: { project, apiKey: "test-secret" },
        args: ["articles", fingerprint, { sort }],
      },
    ]);
  });

  test.each([
    ["limit 0", "?limit=0"],
    ["limit 101", "?limit=101"],
    ["limit 999", "?limit=999"],
    ["limit 1000", "?limit=1000"],
    ["limit with a leading zero", "?limit=020"],
    ["negative limit", "?limit=-1"],
    ["signed limit", "?limit=%2B1"],
    ["fractional limit", "?limit=1.5"],
    ["exponent limit", "?limit=1e2"],
    ["spaced limit", "?limit=%201"],
    ["word limit", "?limit=ten"],
    ["empty limit", "?limit="],
    ["bare limit", "?limit"],
    ["double dash sort", "?sort=--title"],
    ["plus sort", "?sort=%2Btitle"],
    ["dotted sort", "?sort=seo.title"],
    ["digit-led sort", "?sort=1title"],
    ["bare dash sort", "?sort=-"],
    ["spaced sort", "?sort=ti%20tle"],
    ["empty sort", "?sort="],
    ["where array", `?where=${encodeURIComponent("[]")}`],
    ["where null", "?where=null"],
    ["where number", "?where=1"],
    ["where string", `?where=${encodeURIComponent('"title"')}`],
    ["where malformed JSON", `?where=${encodeURIComponent("{")}`],
    ["where unquoted", "?where=status"],
    ["empty where", "?where="],
    ["empty cursor", "?cursor="],
    ["repeated limit", "?limit=1&limit=2"],
    ["repeated identical sort", "?sort=title&sort=title"],
    ["repeated where", "?where=%7B%7D&where=%7B%7D"],
    ["repeated cursor", "?cursor=a&cursor=b"],
    ["unknown parameter", "?page=2"],
    ["unknown parameter beside valid ones", "?limit=2&offset=4"],
    ["empty unknown parameter", "?filter="],
  ])("rejects %s with 400 before the service", async (_name, search) => {
    const { app, calls, headers } = fixture();
    await expectReply(await list(app, search, headers), 400, invalidRequest);
    expect(calls).toEqual([]);
  });

  test.each([
    ["limit 0", "?limit=0"],
    ["unknown parameter", "?page=2"],
    ["where array", `?where=${encodeURIComponent("[]")}`],
    ["sort syntax", "?sort=--title"],
  ])("checks query syntax before the bearer: %s", async (_name, search) => {
    const { app, calls, headers } = fixture();
    await expectReply(
      await list(app, search, without(headers, "authorization", "aircastle-schema")),
      400,
      invalidRequest,
    );
    expect(calls).toEqual([]);
  });

  test.each([
    ["missing header", documents],
    ["malformed project", "/api/projects/x/collections/articles/documents"],
    ["malformed collection", `${base}/collections/bad-name/documents`],
  ])("checks the bearer before a %s", async (_name, path) => {
    const { app, calls, headers } = fixture();
    const response = await app.request(path, {
      headers: without(headers, "authorization", "aircastle-schema", "content-type"),
    });
    await expectReply(response, 401, unauthorized);
    expect(calls).toEqual([]);
  });

  test.each([
    ["missing contract header", documents, { "aircastle-schema": undefined }],
    ["malformed contract header", documents, { "aircastle-schema": "wrong" }],
    ["malformed project", "/api/projects/x/collections/articles/documents", {}],
    ["malformed collection", `${base}/collections/bad-name/documents`, {}],
  ])(
    "returns 400 for a %s before checking the key",
    async (_name, path, overrides: Record<string, string | undefined>) => {
      const { app, calls, headers } = fixture();
      const requestHeaders = new Headers({
        ...without(headers, "content-type"),
        authorization: "Bearer wrong-key",
      });
      for (const [name, value] of Object.entries(overrides)) {
        if (value === undefined) requestHeaders.delete(name);
        else requestHeaders.set(name, value);
      }
      await expectReply(await app.request(path, { headers: requestHeaders }), 400, invalidRequest);
      expect(calls).toEqual([]);
    },
  );

  test.each([
    [{ code: "invalid_request" }, 400],
    [{ code: "not_found" }, 404],
    [{ code: "schema_mismatch" }, 409],
    [{ code: "forbidden" }, 403],
    [{ code: "internal_error" }, 500],
  ] as const)("returns the service error %o with its status", async (error, status) => {
    const { app, headers } = fixture(error);
    await expectReply(await list(app, "", headers), status, { ok: false, error });
  });
});

describe("R11 R13 POST documents/query route", () => {
  const query = (
    app: ReturnType<typeof fixture>["app"],
    body: string,
    headers: Headers | Record<string, string>,
  ) => app.request(queryPath, { method: "POST", headers, body });
  const page = { ok: true, data: { documents: [document], next: null } };

  test("returns 200 and forwards the JSON query exactly", async () => {
    const { app, calls, headers } = fixture();
    const body = { where: { status: "published" }, sort: "-title", limit: 2 };
    await expectReply(await query(app, JSON.stringify(body), headers), 200, page);
    expect(lifecycleCalls(calls)).toEqual([
      {
        operation: "list",
        access: { project, apiKey: "test-secret" },
        args: ["articles", fingerprint, body],
      },
    ]);
  });

  test("forwards the same arguments as the equivalent GET", async () => {
    const posted = fixture();
    const body = { where: { title: { in: ["a", "b"] } }, sort: "title", limit: 100 };
    await expectReply(await query(posted.app, JSON.stringify(body), posted.headers), 200, page);
    const fetched = fixture();
    const search = `?where=${encodeURIComponent(JSON.stringify(body.where))}&sort=title&limit=100`;
    await expectReply(
      await fetched.app.request(`${documents}${search}`, { headers: fetched.headers }),
      200,
      page,
    );
    expect(lifecycleCalls(posted.calls)).toEqual(lifecycleCalls(fetched.calls));
    expect(lifecycleCalls(posted.calls)).toHaveLength(1);
  });

  test("an empty query object forwards an empty query", async () => {
    const { app, calls, headers } = fixture();
    await expectReply(await query(app, "{}", headers), 200, page);
    expect(lifecycleCalls(calls)).toEqual([
      {
        operation: "list",
        access: { project, apiKey: "test-secret" },
        args: ["articles", fingerprint, {}],
      },
    ]);
  });

  test("treats where {} the same as no where", async () => {
    const empty = fixture();
    await expectReply(await query(empty.app, '{"where":{},"limit":3}', empty.headers), 200, page);
    const none = fixture();
    await expectReply(await query(none.app, '{"limit":3}', none.headers), 200, page);
    expect(withoutEmptyWhere(empty.calls)).toEqual(lifecycleCalls(none.calls));
    expect(lifecycleCalls(none.calls)).toHaveLength(1);
  });

  test.each([
    ["array body", "[]"],
    ["null body", "null"],
    ["unknown key", '{"page":2}'],
    ["limit 0", '{"limit":0}'],
    ["limit 101", '{"limit":101}'],
    ["fractional limit", '{"limit":1.5}'],
    ["negative limit", '{"limit":-1}'],
    ["null limit", '{"limit":null}'],
    ["double dash sort", '{"sort":"--title"}'],
    ["dotted sort", '{"sort":"seo.title"}'],
    ["empty sort", '{"sort":""}'],
    ["numeric sort", '{"sort":1}'],
    ["where array", '{"where":[]}'],
    ["where null", '{"where":null}'],
    ["where string", '{"where":"{}"}'],
    ["empty cursor", '{"cursor":""}'],
    ["numeric cursor", '{"cursor":1}'],
    ["malformed JSON", "{"],
  ])("rejects %s with 400 before the service", async (_name, body) => {
    const { app, calls, headers } = fixture();
    await expectReply(await query(app, body, headers), 400, invalidRequest);
    expect(calls).toEqual([]);
  });

  test.each([
    ["malformed JSON", "{"],
    ["limit 0", '{"limit":0}'],
    ["unknown key", '{"page":2}'],
  ])("checks body syntax before the bearer: %s", async (_name, body) => {
    const { app, calls, headers } = fixture();
    await expectReply(
      await query(app, body, without(headers, "authorization", "aircastle-schema")),
      400,
      invalidRequest,
    );
    expect(calls).toEqual([]);
  });

  test("checks the bearer before the contract header", async () => {
    const { app, calls, headers } = fixture();
    await expectReply(
      await query(app, "{}", without(headers, "authorization", "aircastle-schema")),
      401,
      unauthorized,
    );
    expect(calls).toEqual([]);
  });

  test.each([
    ["missing contract header", { "aircastle-schema": undefined }],
    ["malformed contract header", { "aircastle-schema": "wrong" }],
    ["text/plain", { "content-type": "text/plain" }],
  ])("returns 400 for a %s", async (_name, overrides: Record<string, string | undefined>) => {
    const { app, calls, headers } = fixture();
    const requestHeaders = new Headers({ ...headers, authorization: "Bearer wrong-key" });
    for (const [name, value] of Object.entries(overrides)) {
      if (value === undefined) requestHeaders.delete(name);
      else requestHeaders.set(name, value);
    }
    await expectReply(await query(app, "{}", requestHeaders), 400, invalidRequest);
    expect(calls).toEqual([]);
  });

  test("keeps the 1 MiB request limit", async () => {
    const { app, calls, headers } = fixture();
    const body = JSON.stringify({ cursor: "x".repeat(1_048_576 - 13) });
    expect(new TextEncoder().encode(body).length).toBe(1_048_576);
    await expectReply(await query(app, `${body} `, headers), 413, {
      ok: false,
      error: { code: "payload_too_large" },
    });
    expect(calls).toEqual([]);
  });
});
