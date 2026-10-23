import { expect, test } from "vite-plus/test";
import { createService } from "./index.ts";
import {
  access,
  articles,
  contract,
  controlledStore,
  documentId,
  successful,
} from "./test-support/fixtures.ts";

test("create validates the active schema, applies defaults and returns the saved document", async () => {
  const { store, snapshotDocuments } = controlledStore();
  const result = successful(
    await createService(store).create(access, "articles", contract, {
      title: "Hello",
      slug: "hello",
    }),
  );
  expect(result).toEqual({ id: documentId, title: "Hello", slug: "hello", status: "draft" });
  expect(snapshotDocuments()).toEqual([
    { id: documentId, title: "Hello", slug: "hello", status: "draft" },
  ]);
});

test("independent invalid fields aggregate in declaration order and persist nothing", async () => {
  const { store, snapshotDocuments } = controlledStore();
  const result = await createService(store).create(access, "articles", contract, {
    slug: 42,
    status: "invalid",
  });
  expect(result).toMatchObject({ ok: false, error: { code: "validation_failed" } });
  if (result.ok || result.error.code !== "validation_failed")
    throw new Error("Expected validation_failed");
  expect(result.error.issues.map((issue) => ({ code: issue.code, path: issue.path }))).toEqual([
    { code: "required", path: ["title"] },
    { code: "invalid_type", path: ["slug"] },
    { code: "invalid_choice", path: ["status"] },
  ]);
  expect(result.error.issues[1]).toMatchObject({ expected: "string", received: "number" });
  expect(result.error.issues[2]).toMatchObject({ allowed: ["draft", "published"] });
  expect(snapshotDocuments()).toEqual([]);
});

for (const input of [
  { title: "Hello", slug: "hello", id: documentId },
  { title: "Hello", slug: "hello", unknown: "value" },
]) {
  test(`create rejects unknown input field ${Object.keys(input).at(-1)}`, async () => {
    const { store, snapshotDocuments } = controlledStore();
    const result = await createService(store).create(access, "articles", contract, input);
    expect(result).toMatchObject({ ok: false, error: { code: "validation_failed" } });
    expect(snapshotDocuments()).toEqual([]);
  });
}

test("stored reads preserve omitted optional fields and never synthesize defaults", async () => {
  const saved = { id: documentId, title: "Hello", slug: "hello", status: "draft" };
  const { store } = controlledStore({ documents: [saved] });
  expect(await createService(store).findById(access, "articles", contract, documentId)).toEqual({
    ok: true,
    data: saved,
  });
});

test("explicit nullable null survives a read", async () => {
  const saved = { id: documentId, title: "Hello", slug: "hello", summary: null, status: "draft" };
  const { store } = controlledStore({ documents: [saved] });
  expect(await createService(store).findById(access, "articles", contract, documentId)).toEqual({
    ok: true,
    data: saved,
  });
});

test("older clients read only their declared fields plus id", async () => {
  const old = { fields: { title: articles.fields.title!, slug: articles.fields.slug! } };
  const { store } = controlledStore({
    contracts: { [contract]: old },
    documents: [{ id: documentId, title: "Hello", slug: "hello", summary: "New", status: "draft" }],
  });
  expect(await createService(store).findById(access, "articles", contract, documentId)).toEqual({
    ok: true,
    data: { id: documentId, title: "Hello", slug: "hello" },
  });
});

test("a defaulted client output field cannot be manufactured during a read", async () => {
  const withoutStatus = { fields: { title: articles.fields.title!, slug: articles.fields.slug! } };
  const { store } = controlledStore({
    state: {
      revision: "revision-start",
      collections: [{ name: "articles", description: withoutStatus }],
    },
    contracts: { [contract]: articles },
    documents: [{ id: documentId, title: "Hello", slug: "hello" }],
  });
  expect(await createService(store).findById(access, "articles", contract, documentId)).toEqual({
    ok: false,
    error: { code: "schema_mismatch" },
  });
});

test("corrupt authoritative stored data is internal_error rather than repaired content", async () => {
  const { store } = controlledStore({
    documents: [{ id: documentId, title: "Hello", slug: "hello" }],
  });
  expect(await createService(store).findById(access, "articles", contract, documentId)).toEqual({
    ok: false,
    error: { code: "internal_error" },
  });
});

test("incompatible old create contract is rejected even when this title passes", async () => {
  const strict = { fields: { ...articles.fields, title: { ...articles.fields.title!, min: 5 } } };
  const { store, snapshotDocuments } = controlledStore({
    state: { revision: "strict", collections: [{ name: "articles", description: strict }] },
  });
  expect(
    await createService(store).create(access, "articles", contract, {
      title: "Hello",
      slug: "hello",
    }),
  ).toEqual({ ok: false, error: { code: "schema_mismatch" } });
  expect(snapshotDocuments()).toEqual([]);
});

test("schema compatibility precedes document field validation", async () => {
  const { store, snapshotDocuments } = controlledStore({ contracts: {} });
  expect(await createService(store).create(access, "articles", contract, null)).toEqual({
    ok: false,
    error: { code: "schema_mismatch" },
  });
  expect(snapshotDocuments()).toEqual([]);
});

test("collection absence is distinct from document absence", async () => {
  const { store } = controlledStore();
  const cms = createService(store);
  expect(await cms.create(access, "missing", contract, { title: "Hello" })).toEqual({
    ok: false,
    error: { code: "not_found" },
  });
  expect(await cms.findById(access, "articles", contract, documentId)).toEqual({
    ok: false,
    error: { code: "not_found" },
  });
});

test("a malformed document id is invalid_request", async () => {
  const { store } = controlledStore();
  expect(await createService(store).findById(access, "articles", contract, "not-a-uuid")).toEqual({
    ok: false,
    error: { code: "invalid_request" },
  });
});

test("an old client stays compatible with an optional addition", async () => {
  const changed = [
    {
      name: "articles",
      description: {
        fields: {
          ...articles.fields,
          teaser: { type: "text" as const, required: false, nullable: false, unique: false },
        },
      },
    },
  ];
  const { store } = controlledStore({ state: { revision: "optional", collections: changed } });
  expect(
    successful(
      await createService(store).create(access, "articles", contract, {
        title: "Hello",
        slug: "hello",
      }),
    ),
  ).toEqual({ id: documentId, title: "Hello", slug: "hello", status: "draft" });
});

test("a persistence unique conflict retains its structured field detail", async () => {
  const { store, snapshotDocuments } = controlledStore();
  const rejectedStore = {
    ...store,
    transaction: <Value>(
      project: string,
      operation: Parameters<typeof store.transaction<Value>>[1],
    ) =>
      store.transaction(project, (transaction) =>
        operation({
          ...transaction,
          insert: async () => ({
            ok: false as const,
            error: { code: "unique_conflict" as const, field: "slug" },
          }),
        }),
      ),
  };
  expect(
    await createService(rejectedStore).create(access, "articles", contract, {
      title: "Hello",
      slug: "taken",
    }),
  ).toEqual({ ok: false, error: { code: "unique_conflict", field: "slug" } });
  expect(snapshotDocuments()).toEqual([]);
});

test("unexpected storage failures do not expose internal details", async () => {
  const { store } = controlledStore({
    beforeTransaction: async () => {
      throw new Error("SELECT secret FROM private_table WHERE api_key=never-expose");
    },
  });
  expect(await createService(store).schema(access)).toEqual({
    ok: false,
    error: { code: "internal_error" },
  });
});

test("a compatible stricter client cannot receive invalid output or leave a speculative document", async () => {
  const stricter = {
    ...articles,
    fields: { ...articles.fields, title: { ...articles.fields.title!, min: 5 } },
  };
  const { store, snapshotDocuments } = controlledStore({ contracts: { [contract]: stricter } });
  const result = await createService(store).create(access, "articles", contract, {
    title: "Hi",
    slug: "must-not-persist",
  });
  expect(result).toEqual({ ok: false, error: { code: "schema_mismatch" } });
  expect(snapshotDocuments()).toEqual([]);
});
