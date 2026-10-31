import { createHash, randomUUID } from "node:crypto";
import { expect, test } from "vite-plus/test";
import {
  projectDocument,
  validateStored,
  type CollectionDescription,
  type ContentDocument,
  type Permission,
  type PublishedCollection,
  type Result,
} from "@aircastle/contracts";
import {
  createService,
  type Access,
  type ContentService,
  type ContentStore,
  type ErrorSummary,
} from "@aircastle/core";
import { withDatabase } from "./test-support/database.ts";

type Field = CollectionDescription["fields"][string];
interface Presence {
  required?: boolean;
  nullable?: boolean;
}

const permissions: readonly Permission[] = ["content:read", "content:write", "schema:publish"];
const lowercaseUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const generated = expect.stringMatching(lowercaseUuid);

const text = (presence: Presence = {}): Field => ({
  type: "text",
  required: true,
  nullable: false,
  unique: false,
  ...presence,
});
const number = (integer: boolean): Field => ({
  type: "number",
  required: true,
  nullable: false,
  integer,
});
const reference = (collection: string): Field => ({
  type: "reference",
  required: true,
  nullable: false,
  collection,
});
const object = (fields: Record<string, Field>): Extract<Field, { type: "object" }> => ({
  type: "object",
  required: true,
  nullable: false,
  fields,
});
const list = (item: Field, presence: Presence = {}): Field => ({
  type: "list",
  required: true,
  nullable: false,
  item,
  ...presence,
});
const blocks = (variants: Record<string, Extract<Field, { type: "object" }>>): Field => ({
  type: "blocks",
  required: true,
  nullable: false,
  variants,
});

const authors: CollectionDescription = { fields: { name: text() } };
const pages: CollectionDescription = { fields: { name: text() } };
const articles: CollectionDescription = {
  fields: {
    author: reference("authors"),
    coauthors: list(reference("authors"), { required: false }),
    subject: {
      type: "reference",
      required: false,
      nullable: false,
      collections: ["authors", "pages"],
    },
    title: text(),
  },
};
const everything: CollectionDescription = {
  fields: {
    title: text(),
    count: number(true),
    big: number(true),
    ratio: number(false),
    zero: number(false),
    flag: { type: "boolean", required: true, nullable: false },
    day: { type: "date", required: true, nullable: false },
    at: { type: "datetime", required: true, nullable: false },
    tags: list(text()),
    seo: object({ description: text({ required: false }) }),
    author: reference("authors"),
    subject: { type: "reference", required: true, nullable: false, collections: ["authors"] },
    layout: blocks({
      hero: object({ heading: text() }),
      quote: object({ text: text() }),
    }),
    sections: list(
      object({
        heading: text(),
        detail: object({ content: blocks({ quote: object({ text: text() }) }) }),
      }),
    ),
    meta: { type: "json", required: true, nullable: false },
    location: { type: "point", required: true, nullable: false },
  },
};

function successful<Value>(result: Result<Value>): Value {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`Expected success, received ${result.error.code}`);
  return result.data;
}

const failOnReport = (summary: ErrorSummary) => {
  throw summary;
};

async function provision(store: ContentStore, projectName: string): Promise<Access> {
  const apiKey = `ac_${randomUUID()}`;
  const provisioned = await store.provision({
    verifier: createHash("sha256").update(apiKey).digest("hex"),
    permissions,
    key: "reuse",
    workspaceName: "Integration workspace",
    projectName,
  });
  return { project: provisioned.project, apiKey };
}

async function publish(cms: ContentService, access: Access, collections: PublishedCollection[]) {
  return successful(await cms.publish(access, { baseline: null, collections }));
}

async function author(cms: ContentService, access: Access, contract: string, name: string) {
  return successful(await cms.create(access, "authors", contract, { name })).id;
}

const notFound = (path: (string | number)[], collection: string) => ({
  code: "not_found",
  path,
  collection,
  message: expect.any(String),
});

test("existing finds only documents of the named collection in the transaction's project", async () => {
  await withDatabase(async ({ store }) => {
    await store.initialize();
    const cms = createService(store, failOnReport);
    const first = await provision(store, "First");
    const second = await provision(store, "Second");
    const textOnly = [
      { name: "authors", description: authors },
      { name: "pages", description: pages },
    ];
    const firstContracts = (await publish(cms, first, textOnly)).contracts;
    const secondContracts = (await publish(cms, second, textOnly)).contracts;
    const kept = await author(cms, first, firstContracts.authors!, "Kept");
    const alsoKept = await author(cms, first, firstContracts.authors!, "Also kept");
    const page = successful(
      await cms.create(first, "pages", firstContracts.pages!, { name: "P" }),
    ).id;
    const foreign = await author(cms, second, secondContracts.authors!, "Foreign");
    const missing = randomUUID();
    const found = await store.transaction(first.project, (transaction) =>
      transaction.existing("authors", [kept, page, foreign, missing, alsoKept]),
    );
    expect([...found].sort()).toEqual([kept, alsoKept].sort());
    const foundPages = await store.transaction(first.project, (transaction) =>
      transaction.existing("pages", [kept, page, foreign]),
    );
    expect([...foundPages]).toEqual([page]);
  });
});

test("existing locks the found documents against deletion until the transaction ends", async () => {
  await withDatabase(async ({ store, sql, namespace }) => {
    await store.initialize();
    const cms = createService(store, failOnReport);
    const access = await provision(store, "Locking");
    const contracts = (await publish(cms, access, [{ name: "authors", description: authors }]))
      .contracts;
    const kept = await author(cms, access, contracts.authors!, "Kept");
    const attempt = await store.transaction(access.project, async (transaction) => {
      expect([...(await transaction.existing("authors", [kept]))]).toEqual([kept]);
      return sql
        .begin(async (other) => {
          await other`SET LOCAL lock_timeout = '200ms'`;
          await other`DELETE FROM ${sql(namespace)}.documents WHERE id = ${kept}`;
        })
        .then(
          () => "deleted",
          (error: unknown) =>
            error !== null && typeof error === "object" && "code" in error ? error.code : error,
        );
    });
    expect(attempt).toBe("55P03");
    expect(
      await store.transaction(access.project, (transaction) => transaction.read("authors", kept)),
    ).toEqual({ id: kept, name: "Kept" });
  });
});

test("create checks references against real storage and writes nothing when a target is missing", async () => {
  await withDatabase(async ({ store }) => {
    await store.initialize();
    const cms = createService(store, failOnReport);
    const access = await provision(store, "References");
    const other = await provision(store, "Other");
    const collections = [
      { name: "authors", description: authors },
      { name: "pages", description: pages },
      { name: "articles", description: articles },
    ];
    const contracts = (await publish(cms, access, collections)).contracts;
    const otherContracts = (await publish(cms, other, collections)).contracts;
    const kept = await author(cms, access, contracts.authors!, "Kept");
    const page = successful(await cms.create(access, "pages", contracts.pages!, { name: "P" })).id;
    const foreign = await author(cms, other, otherContracts.authors!, "Foreign");

    const failed = await cms.create(access, "articles", contracts.articles!, {
      author: page,
      coauthors: [kept, foreign],
      subject: { collection: "authors", id: page },
      title: "Missing",
    });
    expect(failed).toEqual({
      ok: false,
      error: {
        code: "validation_failed",
        issues: [
          notFound(["author"], "authors"),
          notFound(["coauthors", 1], "authors"),
          notFound(["subject"], "authors"),
        ],
      },
    });
    expect(
      await store.transaction(access.project, (transaction) => transaction.documents("articles")),
    ).toEqual([]);

    const created = successful(
      await cms.create(access, "articles", contracts.articles!, {
        author: kept,
        coauthors: [kept, kept],
        subject: { collection: "pages", id: page },
        title: "Found",
      }),
    );
    expect(created).toEqual({
      id: generated,
      author: kept,
      coauthors: [kept, kept],
      subject: { collection: "pages", id: page },
      title: "Found",
    });
    expect(await cms.findById(access, "articles", contracts.articles!, created.id)).toEqual({
      ok: true,
      data: created,
    });
  });
});

test("a document using every kind round-trips through JSONB unchanged apart from normalization and ids", async () => {
  await withDatabase(async ({ store }) => {
    await store.initialize();
    const cms = createService(store, failOnReport);
    const access = await provision(store, "Round trip");
    const contracts = (
      await publish(cms, access, [
        { name: "authors", description: authors },
        { name: "everything", description: everything },
      ])
    ).contracts;
    const kept = await author(cms, access, contracts.authors!, "Kept");
    const input = {
      title: "All",
      count: 3,
      big: 2 ** 53 - 1,
      ratio: 0.1,
      zero: -0,
      flag: false,
      day: "2024-02-29",
      at: "2026-02-14T09:00+11:00",
      tags: ["a", "b"],
      seo: {},
      author: kept,
      subject: { collection: "authors", id: kept },
      layout: [
        { type: "hero", heading: "Hi" },
        { type: "quote", text: "Kept", id: "b1" },
      ],
      sections: [
        { heading: "One", detail: { content: [{ type: "quote", text: "Deep" }] } },
        { heading: "Two", id: "r1", detail: { content: [] } },
      ],
      meta: { a: [1, "x", true, null, { b: -0 }], big: 2 ** 53 - 1, frac: 0.1 },
      location: { lat: -33.86, lng: 151.21 },
    };
    const expected = {
      title: "All",
      count: 3,
      big: 9007199254740991,
      ratio: 0.1,
      zero: 0,
      flag: false,
      day: "2024-02-29",
      at: "2026-02-13T22:00:00.000Z",
      tags: ["a", "b"],
      seo: {},
      author: kept,
      subject: { collection: "authors", id: kept },
      layout: [
        { type: "hero", heading: "Hi", id: generated },
        { type: "quote", text: "Kept", id: "b1" },
      ],
      sections: [
        {
          heading: "One",
          id: generated,
          detail: { content: [{ type: "quote", text: "Deep", id: generated }] },
        },
        { heading: "Two", id: "r1", detail: { content: [] } },
      ],
      meta: { a: [1, "x", true, null, { b: 0 }], big: 9007199254740991, frac: 0.1 },
      location: { lat: -33.86, lng: 151.21 },
    };
    const created = successful(
      await cms.create(access, "everything", contracts.everything!, input),
    );
    expect(created).toEqual({ id: generated, ...expected });
    const stored = await store.transaction(access.project, (transaction) =>
      transaction.read("everything", created.id),
    );
    expect(stored).toEqual(created);
    if (!stored) throw new Error("Expected a stored document");
    expect(Object.is(stored.zero, 0)).toBe(true);
    const { id: _id, ...data } = stored as ContentDocument;
    expect(validateStored(everything, data)).toBe(true);
    expect(projectDocument(everything, everything, stored)).toEqual({ ok: true, data: created });
    expect(await cms.findById(access, "everything", contracts.everything!, created.id)).toEqual({
      ok: true,
      data: created,
    });
  });
});
