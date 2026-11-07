import { expect, test } from "vite-plus/test";
import type { CollectionDescription, PublishedCollection } from "@aircastle/contracts";
import { createService } from "./index.ts";
import {
  access,
  articles,
  collections,
  controlledStore,
  documentId,
  successful,
  failOnReport,
} from "./test-support/fixtures.ts";

const collection = (description: CollectionDescription): PublishedCollection[] => [
  { name: "articles", description },
];

test("initial publication activates a complete project and returns generated contract identities", async () => {
  const { store, snapshot } = controlledStore({
    state: { revision: null, collections: [] },
  });
  const publication = successful(
    await createService(store, failOnReport).publish(access, { baseline: null, collections }),
  );
  expect(publication.revision).toEqual(expect.any(String));
  expect(publication.revision.length).toBeGreaterThan(0);
  expect(Object.keys(publication.contracts)).toEqual(["articles"]);
  expect(publication.contracts.articles).toMatch(/^v1:[a-f0-9]{64}$/);
  expect(snapshot()).toEqual({ revision: publication.revision, collections });
});

test("identical publication is a no-op even with an outdated baseline", async () => {
  const { store } = controlledStore();
  const result = successful(
    await createService(store, failOnReport).publish(access, {
      baseline: "old-revision",
      collections,
    }),
  );
  expect(result.revision).toBe("revision-start");
});

test("a changed schema with a stale baseline conflicts without activation", async () => {
  const { store, snapshot } = controlledStore();
  const changed = collection({
    fields: {
      ...articles.fields,
      teaser: { type: "text", required: false, nullable: false, unique: false },
    },
  });
  expect(
    await createService(store, failOnReport).publish(access, {
      baseline: "old-revision",
      collections: changed,
    }),
  ).toEqual({ ok: false, error: { code: "schema_conflict" } });
  expect(snapshot()).toEqual({ revision: "revision-start", collections });
});

test("one invalid collection rejects the whole project publication", async () => {
  const { store, snapshot } = controlledStore();
  expect(
    await createService(store, failOnReport).publish(access, {
      baseline: "revision-start",
      collections: [
        ...collections,
        {
          name: "broken",
          description: {
            fields: {
              title: { type: "text", required: true, nullable: false, unique: false, min: -1 },
            },
          },
        },
      ],
    }),
  ).toEqual({ ok: false, error: { code: "invalid_request" } });
  expect(snapshot()).toEqual({ revision: "revision-start", collections });
});

for (const title of ["a", "four"]) {
  test(`tightening title rejects existing value ${JSON.stringify(title)} without changing content`, async () => {
    const saved = { id: documentId, title, slug: "saved", status: "draft" };
    const { store, snapshot, snapshotDocuments } = controlledStore({
      documents: { articles: [saved] },
    });
    const changed = collection({
      fields: { ...articles.fields, title: { ...articles.fields.title!, min: 5 } },
    });
    expect(
      await createService(store, failOnReport).publish(access, {
        baseline: "revision-start",
        collections: changed,
      }),
    ).toEqual({ ok: false, error: { code: "migration_required" } });
    expect(snapshot()).toEqual({ revision: "revision-start", collections });
    expect(snapshotDocuments("articles")).toEqual([saved]);
  });
}

test("tightening accepts existing values already within the proposed rules", async () => {
  const { store, snapshot } = controlledStore({
    documents: { articles: [{ id: documentId, title: "Hello", slug: "hello", status: "draft" }] },
  });
  const changed = collection({
    fields: { ...articles.fields, title: { ...articles.fields.title!, min: 5 } },
  });
  const result = successful(
    await createService(store, failOnReport).publish(access, {
      baseline: "revision-start",
      collections: changed,
    }),
  );
  expect(result.revision).not.toBe("revision-start");
  expect(snapshot().collections).toEqual(changed);
});

test("a new default that would fill existing content requires migration", async () => {
  const { store } = controlledStore({
    documents: { articles: [{ id: documentId, title: "Hello", slug: "hello", status: "draft" }] },
  });
  const changed = collection({
    fields: {
      ...articles.fields,
      category: { type: "text", required: false, nullable: false, unique: false, default: "news" },
    },
  });
  expect(
    await createService(store, failOnReport).publish(access, {
      baseline: "revision-start",
      collections: changed,
    }),
  ).toEqual({ ok: false, error: { code: "migration_required" } });
});

for (const kind of ["field", "collection"]) {
  test(`removing an empty ${kind} is deferred rather than silently destructive`, async () => {
    const { store } = controlledStore();
    const changed =
      kind === "collection" ? [] : collection({ fields: { title: articles.fields.title! } });
    expect(
      await createService(store, failOnReport).publish(access, {
        baseline: "revision-start",
        collections: changed,
      }),
    ).toEqual({ ok: false, error: { code: "migration_required" } });
  });
}

test("editor-only changes create a revision without changing the data contract", async () => {
  const { store } = controlledStore();
  const cms = createService(store, failOnReport);
  const first = successful(await cms.publish(access, { baseline: "revision-start", collections }));
  const changed = collection({
    fields: {
      ...articles.fields,
      title: { ...articles.fields.title!, editor: { type: "textarea", rows: 6 } },
    },
  });
  const second = successful(
    await cms.publish(access, { baseline: first.revision, collections: changed }),
  );
  expect(second.revision).not.toBe(first.revision);
  expect(second.contracts).toEqual(first.contracts);
});
