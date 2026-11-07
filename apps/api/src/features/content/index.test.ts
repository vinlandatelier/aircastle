import { expect, test } from "vite-plus/test";
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
      outcome("update", access, document, [collection, contract, id, request]),
    delete: async (access, collection, contract, id) =>
      outcome("delete", access, { id }, [collection, contract, id]),
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
