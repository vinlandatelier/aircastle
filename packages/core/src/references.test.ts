import { expect, test } from "vite-plus/test";
import type {
  CollectionDescription,
  ContentDocument,
  PublishedCollection,
} from "@aircastle/contracts";
import { createService } from "./index.ts";
import {
  access,
  controlledStore,
  documentId,
  failOnReport,
  successful,
  type StorageCall,
} from "./test-support/fixtures.ts";

type Field = CollectionDescription["fields"][string];

const lowercaseUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const firstAuthor = "a1000000-0000-4000-8000-000000000001";
const secondAuthor = "a1000000-0000-4000-8000-000000000002";
const thirdAuthor = "a1000000-0000-4000-8000-000000000003";
const firstPage = "b1000000-0000-4000-8000-000000000001";
const firstMissing = "f0000000-0000-4000-8000-000000000001";
const secondMissing = "f0000000-0000-4000-8000-000000000002";
const mixedCaseAuthor = "a1b2c3d4-0000-4000-8000-00000000abcd";
const existingDocument = "c1000000-0000-4000-8000-000000000001";

const contracts = {
  articles: `v1:${"a".repeat(64)}`,
  pages: `v1:${"b".repeat(64)}`,
  digests: `v1:${"c".repeat(64)}`,
  layouts: `v1:${"d".repeat(64)}`,
};

const text = (extra: Partial<Extract<Field, { type: "text" }>> = {}): Field => ({
  type: "text",
  required: true,
  nullable: false,
  unique: false,
  ...extra,
});
interface Presence {
  required?: boolean;
  nullable?: boolean;
}
const reference = (collection: string, presence: Presence = {}): Field => ({
  type: "reference",
  required: true,
  nullable: false,
  collection,
  ...presence,
});
const multiReference = (collections: string[], presence: Presence = {}): Field => ({
  type: "reference",
  required: true,
  nullable: false,
  collections,
  ...presence,
});
const object = (
  fields: Record<string, Field>,
  presence: Presence = {},
): Extract<Field, { type: "object" }> => ({
  type: "object",
  required: presence.required ?? true,
  nullable: presence.nullable ?? false,
  fields,
});
const list = (item: Field, presence: Presence & { default?: string[] } = {}): Field => ({
  type: "list",
  required: true,
  nullable: false,
  item,
  ...presence,
});
const blocks = (
  variants: Record<string, Extract<Field, { type: "object" }>>,
  presence: Presence = {},
): Field => ({
  type: "blocks",
  required: true,
  nullable: false,
  variants,
  ...presence,
});
const optional = { required: false };

const authors: CollectionDescription = { fields: { name: text() } };
const users: CollectionDescription = { fields: { name: text() } };
const pages: CollectionDescription = {
  fields: {
    parent: reference("pages", { required: false, nullable: true }),
    title: text(),
  },
};
const articles: CollectionDescription = {
  fields: {
    author: reference("authors"),
    coauthors: list(reference("authors"), optional),
    credits: blocks({ credit: object({ by: reference("authors") }) }, optional),
    related: list(object({ author: reference("authors") }), optional),
    seo: object(
      { reviewer: reference("authors", { required: false, nullable: true }) },
      { required: false },
    ),
    slug: text({ unique: true }),
    subject: multiReference(["authors", "pages"], optional),
    title: text(),
  },
};
const digests: CollectionDescription = {
  fields: {
    featured: list(reference("authors"), { required: false, default: [firstMissing] }),
    lead: {
      ...object({ by: reference("authors") }, { required: false }),
      default: { by: secondMissing },
    },
    title: text(),
  },
};
const layouts: CollectionDescription = {
  fields: {
    body: blocks({
      hero: object({ heading: text() }),
      gallery: object({ slides: blocks({ image: object({ caption: text() }) }) }),
    }),
    maybe: list(object({ a: text() }, { nullable: true })),
    owner: reference("authors"),
    rows: list(
      object({
        label: text(),
        cells: blocks({ cell: object({ v: text() }) }),
      }),
    ),
    section: object({ content: blocks({ quote: object({ text: text() }) }) }),
    tags: list(text()),
  },
};

const published: PublishedCollection[] = [
  { name: "authors", description: authors },
  { name: "pages", description: pages },
  { name: "articles", description: articles },
  { name: "digests", description: digests },
  { name: "layouts", description: layouts },
];

const savedAuthors: ContentDocument[] = [
  { id: firstAuthor, name: "First" },
  { id: secondAuthor, name: "Second" },
  { id: thirdAuthor, name: "Third" },
  { id: mixedCaseAuthor, name: "Mixed" },
];
const savedPages: ContentDocument[] = [{ id: firstPage, title: "Home", parent: null }];

function referenceStore(
  documents: Record<string, ContentDocument[]> = {},
  collections: PublishedCollection[] = published,
) {
  return controlledStore({
    state: { revision: "revision-start", collections },
    documents: { authors: savedAuthors, pages: savedPages, ...documents },
    contracts: {
      [contracts.articles]: articles,
      [contracts.pages]: pages,
      [contracts.digests]: digests,
      [contracts.layouts]: layouts,
    },
  });
}

const notFound = (path: (string | number)[], collection: string) => ({
  code: "not_found",
  path,
  collection,
  message: expect.any(String),
});

const lookups = (calls: StorageCall[]) =>
  calls.filter(
    (call): call is Extract<StorageCall, { kind: "existing" }> => call.kind === "existing",
  );

const inserts = (calls: StorageCall[]) => calls.filter((call) => call.kind === "insert");

function dig(value: unknown, path: (string | number)[]): unknown {
  return path.reduce<unknown>(
    (current, key) =>
      current !== null && typeof current === "object" ? Reflect.get(current, key) : undefined,
    value,
  );
}

test("a reference to an existing document is stored and read back as the bare id", async () => {
  const { store, snapshotDocuments } = referenceStore();
  const service = createService(store, failOnReport);
  const created = await service.create(access, "articles", contracts.articles, {
    author: firstAuthor,
    slug: "hello",
    title: "Hello",
  });
  expect(created).toEqual({
    ok: true,
    data: { id: documentId, author: firstAuthor, slug: "hello", title: "Hello" },
  });
  expect(snapshotDocuments("articles")).toEqual([
    { id: documentId, author: firstAuthor, slug: "hello", title: "Hello" },
  ]);
  expect(await service.findById(access, "articles", contracts.articles, documentId)).toEqual({
    ok: true,
    data: { id: documentId, author: firstAuthor, slug: "hello", title: "Hello" },
  });
});

test("every missing target is not_found at its path, depth-first, one per occurrence, and nothing is written", async () => {
  const { store, snapshotDocuments, observations } = referenceStore();
  const result = await createService(store, failOnReport).create(
    access,
    "articles",
    contracts.articles,
    {
      author: firstMissing,
      coauthors: [firstAuthor, firstMissing, firstMissing],
      credits: [{ type: "credit", by: secondMissing }],
      related: [{ author: firstAuthor }, { author: firstMissing }],
      seo: { reviewer: secondMissing },
      slug: "missing",
      subject: { collection: "pages", id: firstMissing },
      title: "Missing",
    },
  );
  expect(result).toEqual({
    ok: false,
    error: {
      code: "validation_failed",
      issues: [
        notFound(["author"], "authors"),
        notFound(["coauthors", 1], "authors"),
        notFound(["coauthors", 2], "authors"),
        notFound(["credits", 0, "by"], "authors"),
        notFound(["related", 1, "author"], "authors"),
        notFound(["seo", "reviewer"], "authors"),
        notFound(["subject"], "pages"),
      ],
    },
  });
  expect(snapshotDocuments("articles")).toEqual([]);
  expect(inserts(observations.storage)).toEqual([]);
});

test("a multi-reference whose id exists only in another listed collection is not_found at the reference path", async () => {
  const { store, snapshotDocuments } = referenceStore();
  const result = await createService(store, failOnReport).create(
    access,
    "articles",
    contracts.articles,
    {
      author: firstAuthor,
      slug: "multi",
      subject: { collection: "authors", id: firstPage },
      title: "Multi",
    },
  );
  expect(result).toEqual({
    ok: false,
    error: { code: "validation_failed", issues: [notFound(["subject"], "authors")] },
  });
  expect(snapshotDocuments("articles")).toEqual([]);
});

test("a multi-reference to an existing document stores the collection and id unchanged", async () => {
  const { store } = referenceStore();
  const created = successful(
    await createService(store, failOnReport).create(access, "articles", contracts.articles, {
      author: firstAuthor,
      slug: "multi",
      subject: { collection: "pages", id: firstPage },
      title: "Multi",
    }),
  );
  expect(created).toEqual({
    id: documentId,
    author: firstAuthor,
    slug: "multi",
    subject: { collection: "pages", id: firstPage },
    title: "Multi",
  });
});

test("create reports field issues, then missing references, then uniqueness, one phase at a time", async () => {
  const { store, snapshotDocuments, observations } = referenceStore({
    articles: [{ id: existingDocument, author: firstAuthor, slug: "taken", title: "Existing" }],
  });
  const service = createService(store, failOnReport);
  const create = (title: unknown, author: string) =>
    service.create(access, "articles", contracts.articles, { author, slug: "taken", title });

  expect(await create(5, firstMissing)).toEqual({
    ok: false,
    error: {
      code: "validation_failed",
      issues: [
        {
          code: "invalid_type",
          path: ["title"],
          expected: "string",
          received: "number",
          message: expect.any(String),
        },
      ],
    },
  });
  expect(observations.storage).toEqual([]);

  expect(await create("Fixed", firstMissing)).toEqual({
    ok: false,
    error: { code: "validation_failed", issues: [notFound(["author"], "authors")] },
  });
  expect(inserts(observations.storage)).toEqual([]);

  expect(await create("Fixed", firstAuthor)).toEqual({
    ok: false,
    error: { code: "unique_conflict", field: "slug" },
  });
  expect(snapshotDocuments("articles")).toEqual([
    { id: existingDocument, author: firstAuthor, slug: "taken", title: "Existing" },
  ]);
});

test("malformed and uppercase reference ids are not_found without a lookup and without case conversion", async () => {
  const { store, snapshotDocuments, observations } = referenceStore();
  const result = await createService(store, failOnReport).create(
    access,
    "articles",
    contracts.articles,
    {
      author: "a_123",
      coauthors: ["A1B2C3D4-0000-4000-8000-00000000ABCD"],
      slug: "malformed",
      title: "Malformed",
    },
  );
  expect(result).toEqual({
    ok: false,
    error: {
      code: "validation_failed",
      issues: [notFound(["author"], "authors"), notFound(["coauthors", 0], "authors")],
    },
  });
  const looked = lookups(observations.storage).flatMap((call) => call.ids);
  expect(looked).not.toContain("a_123");
  expect(looked).not.toContain("A1B2C3D4-0000-4000-8000-00000000ABCD");
  expect(looked).not.toContain(mixedCaseAuthor);
  expect(snapshotDocuments("articles")).toEqual([]);
});

test("the reference check makes one lookup per target collection covering every referenced id", async () => {
  const { store, observations } = referenceStore();
  successful(
    await createService(store, failOnReport).create(access, "articles", contracts.articles, {
      author: firstAuthor,
      coauthors: [secondAuthor, firstAuthor, secondAuthor],
      credits: [{ type: "credit", by: firstAuthor }],
      related: [{ author: thirdAuthor }, { author: secondAuthor }],
      seo: { reviewer: null },
      slug: "batched",
      subject: { collection: "pages", id: firstPage },
      title: "Batched",
    }),
  );
  const calls = lookups(observations.storage)
    .map((call) => ({ collection: call.collection, ids: [...new Set(call.ids)].sort() }))
    .sort((left, right) => left.collection.localeCompare(right.collection));
  expect(calls).toEqual([
    { collection: "authors", ids: [firstAuthor, secondAuthor, thirdAuthor] },
    { collection: "pages", ids: [firstPage] },
  ]);
});

test("a self-reference to the document being created is not_found", async () => {
  const { store, snapshotDocuments } = referenceStore();
  const result = await createService(store, failOnReport).create(access, "pages", contracts.pages, {
    parent: documentId,
    title: "Self",
  });
  expect(result).toEqual({
    ok: false,
    error: { code: "validation_failed", issues: [notFound(["parent"], "pages")] },
  });
  expect(snapshotDocuments("pages")).toEqual(savedPages);
});

test("a self-reference to an existing document in the same collection succeeds", async () => {
  const { store } = referenceStore();
  expect(
    await createService(store, failOnReport).create(access, "pages", contracts.pages, {
      parent: firstPage,
      title: "Child",
    }),
  ).toEqual({ ok: true, data: { id: documentId, parent: firstPage, title: "Child" } });
});

test("references inside applied defaults are checked", async () => {
  const { store, snapshotDocuments } = referenceStore();
  const result = await createService(store, failOnReport).create(
    access,
    "digests",
    contracts.digests,
    { title: "Weekly" },
  );
  expect(result).toEqual({
    ok: false,
    error: {
      code: "validation_failed",
      issues: [notFound(["featured", 0], "authors"), notFound(["lead", "by"], "authors")],
    },
  });
  expect(snapshotDocuments("digests")).toEqual([]);
});

const layoutInput = {
  body: [
    { type: "hero", heading: "Hi" },
    { type: "hero", heading: "Kept", id: "b1" },
    { type: "gallery", slides: [{ type: "image", caption: "One" }] },
  ],
  maybe: [null, { a: "x" }],
  owner: firstAuthor,
  rows: [
    { label: "First", cells: [{ type: "cell", v: "x" }] },
    { label: "Second", id: "r1", cells: [] },
  ],
  section: { content: [{ type: "quote", text: "Q" }] },
  tags: ["news"],
};
const generatedIdPaths: (string | number)[][] = [
  ["body", 0, "id"],
  ["body", 2, "id"],
  ["body", 2, "slides", 0, "id"],
  ["maybe", 1, "id"],
  ["rows", 0, "id"],
  ["rows", 0, "cells", 0, "id"],
  ["section", "content", 0, "id"],
];
const generated = expect.stringMatching(lowercaseUuid);
const layoutWithIds = {
  body: [
    { type: "hero", heading: "Hi", id: generated },
    { type: "hero", heading: "Kept", id: "b1" },
    {
      type: "gallery",
      id: generated,
      slides: [{ type: "image", caption: "One", id: generated }],
    },
  ],
  maybe: [null, { a: "x", id: generated }],
  owner: firstAuthor,
  rows: [
    { label: "First", id: generated, cells: [{ type: "cell", v: "x", id: generated }] },
    { label: "Second", id: "r1", cells: [] },
  ],
  section: { content: [{ type: "quote", text: "Q", id: generated }] },
  tags: ["news"],
};

test("create assigns lowercase UUID ids to every block and row at any depth and keeps supplied ids", async () => {
  const { store, snapshotDocuments } = referenceStore();
  const service = createService(store, failOnReport);
  const created = successful(
    await service.create(access, "layouts", contracts.layouts, layoutInput),
  );
  expect(created).toEqual({ id: documentId, ...layoutWithIds });
  expect(snapshotDocuments("layouts")).toEqual([created]);
  const ids = generatedIdPaths.map((path) => dig(created, path));
  expect(new Set(ids).size).toBe(ids.length);
  expect(await service.findById(access, "layouts", contracts.layouts, documentId)).toEqual({
    ok: true,
    data: created,
  });
});

test("create assigns ids to blocks and rows whose id is explicitly undefined", async () => {
  const { store } = referenceStore();
  const created = successful(
    await createService(store, failOnReport).create(access, "layouts", contracts.layouts, {
      body: [{ type: "hero", heading: "Hi", id: undefined }],
      maybe: [],
      owner: firstAuthor,
      rows: [{ label: "First", id: undefined, cells: [] }],
      section: { content: [] },
      tags: [],
    }),
  );
  expect(created).toEqual({
    id: documentId,
    body: [{ type: "hero", heading: "Hi", id: generated }],
    maybe: [],
    owner: firstAuthor,
    rows: [{ label: "First", id: generated, cells: [] }],
    section: { content: [] },
    tags: [],
  });
});

test("ids are assigned after the reference check and are present in the inserted data", async () => {
  const { store, observations } = referenceStore();
  successful(
    await createService(store, failOnReport).create(
      access,
      "layouts",
      contracts.layouts,
      layoutInput,
    ),
  );
  expect(observations.storage).toEqual([
    { kind: "existing", collection: "authors", ids: [firstAuthor] },
    { kind: "insert", collection: "layouts", data: layoutWithIds },
  ]);
});

test("a failed reference check assigns no ids and inserts nothing", async () => {
  const { store, observations, snapshotDocuments } = referenceStore();
  const result = await createService(store, failOnReport).create(
    access,
    "layouts",
    contracts.layouts,
    { ...layoutInput, owner: firstMissing },
  );
  expect(result).toEqual({
    ok: false,
    error: { code: "validation_failed", issues: [notFound(["owner"], "authors")] },
  });
  expect(inserts(observations.storage)).toEqual([]);
  expect(snapshotDocuments("layouts")).toEqual([]);
});

const retargetable = (author: Field): PublishedCollection[] => [
  { name: "authors", description: authors },
  { name: "users", description: users },
  { name: "pages", description: pages },
  { name: "notes", description: { fields: { author, title: text() } } },
];

test("retargeting a single reference fails with migration_required when the collection has documents", async () => {
  const before = retargetable(reference("authors"));
  const { store, snapshot } = referenceStore(
    { notes: [{ id: existingDocument, author: firstAuthor, title: "Note" }], users: [] },
    before,
  );
  expect(
    await createService(store, failOnReport).publish(access, {
      baseline: "revision-start",
      collections: retargetable(reference("users")),
    }),
  ).toEqual({ ok: false, error: { code: "migration_required" } });
  expect(snapshot()).toEqual({ revision: "revision-start", collections: before });
});

test("retargeting a single reference publishes when the collection has no documents", async () => {
  const after = retargetable(reference("users"));
  const { store, snapshot } = referenceStore(
    { notes: [], users: [] },
    retargetable(reference("authors")),
  );
  const publication = successful(
    await createService(store, failOnReport).publish(access, {
      baseline: "revision-start",
      collections: after,
    }),
  );
  expect(snapshot()).toEqual({ revision: publication.revision, collections: after });
});

test("removing a used collection from a multi-reference fails with migration_required when the collection has documents", async () => {
  const before = retargetable(multiReference(["authors", "pages"]));
  const { store, snapshot } = referenceStore(
    {
      notes: [
        { id: existingDocument, author: { collection: "pages", id: firstPage }, title: "Note" },
      ],
      users: [],
    },
    before,
  );
  expect(
    await createService(store, failOnReport).publish(access, {
      baseline: "revision-start",
      collections: retargetable(multiReference(["authors"])),
    }),
  ).toEqual({ ok: false, error: { code: "migration_required" } });
  expect(snapshot()).toEqual({ revision: "revision-start", collections: before });
});

test("removing a collection from a multi-reference publishes when the collection has no documents", async () => {
  const after = retargetable(multiReference(["authors"]));
  const { store, snapshot } = referenceStore(
    { notes: [], users: [] },
    retargetable(multiReference(["authors", "pages"])),
  );
  const publication = successful(
    await createService(store, failOnReport).publish(access, {
      baseline: "revision-start",
      collections: after,
    }),
  );
  expect(snapshot()).toEqual({ revision: publication.revision, collections: after });
});

test("removing an unused collection from a multi-reference publishes when the collection has documents", async () => {
  const after = retargetable(multiReference(["authors"]));
  const { store, snapshot } = referenceStore(
    {
      notes: [
        {
          id: existingDocument,
          author: { collection: "authors", id: firstAuthor },
          title: "Note",
        },
      ],
      users: [],
    },
    retargetable(multiReference(["authors", "pages"])),
  );
  const publication = successful(
    await createService(store, failOnReport).publish(access, {
      baseline: "revision-start",
      collections: after,
    }),
  );
  expect(snapshot()).toEqual({ revision: publication.revision, collections: after });
});
