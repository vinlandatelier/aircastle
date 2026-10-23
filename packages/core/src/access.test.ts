import { expect, test } from "vite-plus/test";
import type { Permission } from "@aircastle/contracts";
import { createService } from "./index.ts";
import {
  access,
  articles,
  contract,
  controlledStore,
  documentId,
  otherProject,
} from "./test-support/fixtures.ts";

for (const permission of [
  "content:read",
  "content:write",
  "schema:publish",
] satisfies Permission[]) {
  test(`authorized key can request ${permission}`, async () => {
    const { store, observations } = controlledStore();
    expect(await createService(store).authorize(access, permission)).toEqual({
      ok: true,
      data: null,
    });
    expect(observations.authorization).toHaveLength(1);
    expect(observations.authorization[0]).toMatchObject({ project: access.project, permission });
    expect(observations.authorization[0]?.verifier).not.toBe(access.apiKey);
    expect(observations.authorization[0]?.verifier.length).toBeGreaterThan(0);
  });

  test(`invalid key cannot request ${permission}`, async () => {
    const { store } = controlledStore({ authorization: "unauthorized" });
    expect(await createService(store).authorize(access, permission)).toEqual({
      ok: false,
      error: { code: "unauthorized" },
    });
  });

  test(`a key lacking ${permission} receives forbidden`, async () => {
    const { store } = controlledStore({ authorization: "forbidden" });
    expect(await createService(store).authorize(access, permission)).toEqual({
      ok: false,
      error: { code: "forbidden" },
    });
  });
}

test("foreign target does not expand project authority", async () => {
  const { store } = controlledStore({ authorization: "forbidden" });
  const cms = createService(store);
  expect(
    await cms.findById(
      { ...access, project: otherProject },
      "private_collection",
      contract,
      documentId,
    ),
  ).toEqual({ ok: false, error: { code: "forbidden" } });
});

test("unauthorized requests do not reveal collection or schema state", async () => {
  const { store } = controlledStore({ authorization: "unauthorized" });
  const cms = createService(store);
  const results = await Promise.all([
    cms.schema(access),
    cms.create(access, "unknown", contract, { title: "Hello", slug: "hello" }),
    cms.findById(access, "unknown", contract, documentId),
    cms.publish(access, {
      baseline: null,
      collections: [{ name: "unknown", description: articles }],
    }),
  ]);
  for (const result of results)
    expect(result).toEqual({ ok: false, error: { code: "unauthorized" } });
});

test("read-only keys cannot create or publish but can read", async () => {
  const saved = { id: documentId, title: "Hello", slug: "hello", status: "draft" };
  const { store } = controlledStore({
    authorization: (permission) => (permission === "content:read" ? "authorized" : "forbidden"),
    documents: [saved],
  });
  const cms = createService(store);
  expect(await cms.create(access, "articles", contract, { title: "Hello", slug: "hello" })).toEqual(
    { ok: false, error: { code: "forbidden" } },
  );
  expect(
    await cms.publish(access, {
      baseline: "revision-start",
      collections: [{ name: "articles", description: articles }],
    }),
  ).toEqual({ ok: false, error: { code: "forbidden" } });
  expect(await cms.schema(access)).toEqual({ ok: false, error: { code: "forbidden" } });
  expect(await cms.findById(access, "articles", contract, documentId)).toEqual({
    ok: true,
    data: saved,
  });
});
