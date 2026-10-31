import type { CollectionDescription, Permission } from "@aircastle/contracts";
import { describe, expect, test } from "vite-plus/test";
import { createService } from "./index.ts";
import {
  access,
  articles,
  contract,
  controlledStore,
  documentId,
  failOnReport,
} from "./test-support/fixtures.ts";

const other = "55555555-5555-4555-8555-555555555555";
const stored = { id: documentId, title: "Hello", slug: "hello", status: "draft" };
const neighbour = { id: other, title: "Other", slug: "other", status: "draft" };

function seeded(options: Parameters<typeof controlledStore>[0] = {}) {
  const control = controlledStore({ documents: { articles: [stored, neighbour] }, ...options });
  return { ...control, cms: createService(control.store, failOnReport) };
}

describe("R5 delete", () => {
  test("delete removes the document and returns its id", async () => {
    const { cms } = seeded();
    expect(await cms.delete(access, "articles", contract, documentId)).toEqual({
      ok: true,
      data: { id: documentId },
    });
    expect(await cms.findById(access, "articles", contract, documentId)).toEqual({
      ok: false,
      error: { code: "not_found" },
    });
    expect(await cms.findById(access, "articles", contract, other)).toEqual({
      ok: true,
      data: neighbour,
    });
  });

  test("R13 an uppercase id deletes the document and the result id is lowercase", async () => {
    const { cms } = seeded();
    expect(await cms.delete(access, "articles", contract, documentId.toUpperCase())).toEqual({
      ok: true,
      data: { id: documentId },
    });
    expect(await cms.findById(access, "articles", contract, documentId)).toEqual({
      ok: false,
      error: { code: "not_found" },
    });
  });

  test("a repeated delete returns not_found", async () => {
    const { cms } = seeded();
    expect(await cms.delete(access, "articles", contract, documentId)).toEqual({
      ok: true,
      data: { id: documentId },
    });
    expect(await cms.delete(access, "articles", contract, documentId)).toEqual({
      ok: false,
      error: { code: "not_found" },
    });
  });

  test("deleting a document that never existed returns not_found and keeps the others", async () => {
    const { cms } = seeded();
    expect(
      await cms.delete(access, "articles", contract, "99999999-9999-4999-8999-999999999999"),
    ).toEqual({ ok: false, error: { code: "not_found" } });
    expect(await cms.findById(access, "articles", contract, documentId)).toEqual({
      ok: true,
      data: stored,
    });
  });

  for (const id of ["not-a-uuid", "", `${documentId}0`, documentId.replaceAll("-", "")])
    test(`a malformed id ${JSON.stringify(id)} returns invalid_request`, async () => {
      const { cms } = seeded();
      expect(await cms.delete(access, "articles", contract, id)).toEqual({
        ok: false,
        error: { code: "invalid_request" },
      });
      expect(await cms.findById(access, "articles", contract, documentId)).toEqual({
        ok: true,
        data: stored,
      });
    });

  test("delete frees the unique slug so a new document can take it", async () => {
    const { cms } = seeded();
    expect(await cms.delete(access, "articles", contract, documentId)).toEqual({
      ok: true,
      data: { id: documentId },
    });
    expect(
      await cms.create(access, "articles", contract, { title: "Again", slug: "hello" }),
    ).toEqual({
      ok: true,
      data: { id: expect.any(String), title: "Again", slug: "hello", status: "draft" },
    });
  });

  test("a document created through the service can be deleted and its slug recreated", async () => {
    const { store } = controlledStore();
    const cms = createService(store, failOnReport);
    const created = await cms.create(access, "articles", contract, {
      title: "First",
      slug: "reused",
    });
    expect(created).toEqual({
      ok: true,
      data: { id: documentId, title: "First", slug: "reused", status: "draft" },
    });
    expect(await cms.delete(access, "articles", contract, documentId)).toEqual({
      ok: true,
      data: { id: documentId },
    });
    expect(
      await cms.create(access, "articles", contract, { title: "Second", slug: "reused" }),
    ).toEqual({
      ok: true,
      data: { id: expect.any(String), title: "Second", slug: "reused", status: "draft" },
    });
  });
});

describe("R6 R13 delete and values that are not references", () => {
  test("a text field holding another document's id does not block deleting that document", async () => {
    const pointer = { id: other, title: documentId, slug: "pointer", status: "draft" };
    const { store } = controlledStore({ documents: { articles: [stored, pointer] } });
    const cms = createService(store, failOnReport);
    expect(await cms.delete(access, "articles", contract, documentId)).toEqual({
      ok: true,
      data: { id: documentId },
    });
    expect(await cms.findById(access, "articles", contract, documentId)).toEqual({
      ok: false,
      error: { code: "not_found" },
    });
    expect(await cms.findById(access, "articles", contract, other)).toEqual({
      ok: true,
      data: pointer,
    });
  });
});

describe("R13 delete skips stored-document validation", () => {
  test("a stored document invalid under the active schema deletes without a report", async () => {
    const corrupt = { id: documentId, title: "Hello", status: "draft" };
    const { store } = controlledStore({ documents: { articles: [corrupt, neighbour] } });
    const cms = createService(store, failOnReport);
    expect(await cms.delete(access, "articles", contract, documentId)).toEqual({
      ok: true,
      data: { id: documentId },
    });
    expect(await cms.findById(access, "articles", contract, documentId)).toEqual({
      ok: false,
      error: { code: "not_found" },
    });
    expect(await cms.findById(access, "articles", contract, other)).toEqual({
      ok: true,
      data: neighbour,
    });
  });
});

describe("R5 delete access and contracts", () => {
  test("delete checks the content:write permission", async () => {
    const { cms, observations } = seeded();
    expect(await cms.delete(access, "articles", contract, documentId)).toEqual({
      ok: true,
      data: { id: documentId },
    });
    expect(observations.authorization.map((entry) => entry.permission)).toEqual(["content:write"]);
  });

  test("a key without content:write is forbidden and deletes nothing", async () => {
    const authorization = (permission: Permission) =>
      permission === "content:write" ? "forbidden" : "authorized";
    const { cms, observations } = seeded({ authorization });
    expect(await cms.delete(access, "articles", contract, documentId)).toEqual({
      ok: false,
      error: { code: "forbidden" },
    });
    expect(observations.authorization.map((entry) => entry.permission)).toEqual(["content:write"]);
    expect(await cms.findById(access, "articles", contract, documentId)).toEqual({
      ok: true,
      data: stored,
    });
  });

  test("a missing API key is unauthorized and deletes nothing", async () => {
    const { cms } = seeded();
    expect(await cms.delete({ ...access, apiKey: "" }, "articles", contract, documentId)).toEqual({
      ok: false,
      error: { code: "unauthorized" },
    });
    expect(await cms.findById(access, "articles", contract, documentId)).toEqual({
      ok: true,
      data: stored,
    });
  });

  test("a known contract that fails create compatibility can still delete", async () => {
    const strict: CollectionDescription = {
      fields: { ...articles.fields, title: { ...articles.fields.title!, min: 5 } },
    };
    const { cms } = seeded({
      state: { revision: "strict", collections: [{ name: "articles", description: strict }] },
    });
    expect(
      await cms.create(access, "articles", contract, { title: "Hello", slug: "fresh" }),
    ).toEqual({ ok: false, error: { code: "schema_mismatch" } });
    expect(await cms.delete(access, "articles", contract, documentId)).toEqual({
      ok: true,
      data: { id: documentId },
    });
    expect(await cms.findById(access, "articles", contract, documentId)).toEqual({
      ok: false,
      error: { code: "not_found" },
    });
  });

  test("an unknown contract returns schema_mismatch and deletes nothing", async () => {
    const reader = `v1:${"2".repeat(64)}`;
    const { cms } = seeded({ contracts: { [reader]: articles } });
    expect(await cms.delete(access, "articles", contract, documentId)).toEqual({
      ok: false,
      error: { code: "schema_mismatch" },
    });
    expect(await cms.findById(access, "articles", reader, documentId)).toEqual({
      ok: true,
      data: stored,
    });
  });

  test("R13 an unknown contract wins over a missing document", async () => {
    const { cms } = seeded({ contracts: {} });
    expect(
      await cms.delete(access, "articles", contract, "99999999-9999-4999-8999-999999999999"),
    ).toEqual({ ok: false, error: { code: "schema_mismatch" } });
  });

  test("an unknown collection returns not_found, even with an unknown contract", async () => {
    const { cms } = seeded({ contracts: {} });
    expect(await cms.delete(access, "missing", contract, documentId)).toEqual({
      ok: false,
      error: { code: "not_found" },
    });
  });

  test("an unknown collection returns not_found and deletes nothing", async () => {
    const { cms } = seeded();
    expect(await cms.delete(access, "missing", contract, documentId)).toEqual({
      ok: false,
      error: { code: "not_found" },
    });
    expect(await cms.findById(access, "articles", contract, documentId)).toEqual({
      ok: true,
      data: stored,
    });
  });
});
