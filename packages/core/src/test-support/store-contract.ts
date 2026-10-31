import type { ContentDocument, DocumentData, PublishedCollection } from "@aircastle/contracts";
import { describe, expect, test } from "vite-plus/test";
import type { ContentStore, FieldFilter, ListPosition, PageRequest, StoredPage } from "../index.ts";
import { articles } from "./fixtures.ts";

/** A store with one provisioned project that has no active collections yet. */
export interface StoreFixture {
  store: ContentStore;
  project: string;
}

/** Runs `use` against a fresh store fixture and releases the fixture afterwards. */
export type OpenStore = (use: (fixture: StoreFixture) => Promise<void>) => Promise<void>;

const collections: PublishedCollection[] = [
  { name: "articles", description: articles },
  { name: "pages", description: articles },
];
const publication = {
  revision: "contract-revision",
  contracts: { articles: `v1:${"a".repeat(64)}`, pages: `v1:${"b".repeat(64)}` },
};

async function seeded(
  store: ContentStore,
  project: string,
  entries: readonly DocumentData[],
): Promise<ContentDocument[]> {
  return store.transaction(project, async (transaction) => {
    await transaction.activate(collections, publication);
    const saved: ContentDocument[] = [];
    for (const data of entries) {
      const inserted = await transaction.insert("articles", data, ["slug"]);
      if (!inserted.ok) throw new Error("Expected the seed insert to succeed");
      saved.push(inserted.data);
    }
    return saved;
  });
}

const paged = (store: ContentStore, project: string, request: PageRequest): Promise<StoredPage> =>
  store.transaction(project, (transaction) => transaction.page("articles", request));

const newest = (limit = 100): PageRequest => ({
  filters: [],
  order: { by: "created", after: undefined },
  limit,
});

const byField = (direction: "ascending" | "descending", limit = 100): PageRequest => ({
  filters: [],
  order: { by: "field", field: "summary", direction, after: undefined },
  limit,
});

const titles = (page: StoredPage) => page.entries.map((entry) => entry.document.title);

function createdValues(page: StoredPage): bigint[] {
  return page.entries.map((entry) => entry.position.created);
}

function strictlyDecreasing(values: readonly bigint[]): boolean {
  return values.every((value, index) => index === 0 || value < values[index - 1]!);
}

function positionAt(page: StoredPage, index: number): ListPosition {
  const position = page.entries[index]?.position;
  expect(position).toBeDefined();
  if (!position) throw new Error(`Expected a page entry at ${index}`);
  return position;
}

const filterSeeds: DocumentData[] = [
  { title: "n1", slug: "n1", summary: "news" },
  { title: "n2", slug: "n2", summary: "" },
  { title: "n3", slug: "n3", summary: null },
  { title: "n4", slug: "n4" },
  { title: "n5", slug: "n5", summary: "News" },
];

const filterTable: { name: string; filters: FieldFilter[]; expected: string[] }[] = [
  {
    name: "is matches the exact value only",
    filters: [{ field: "summary", operator: "is", value: "news" }],
    expected: ["n1"],
  },
  {
    name: "is matches the empty string as a value",
    filters: [{ field: "summary", operator: "is", value: "" }],
    expected: ["n2"],
  },
  {
    name: "is is case-sensitive",
    filters: [{ field: "summary", operator: "is", value: "News" }],
    expected: ["n5"],
  },
  {
    name: "not includes missing and null",
    filters: [{ field: "summary", operator: "not", value: "news" }],
    expected: ["n5", "n4", "n3", "n2"],
  },
  {
    name: "not of the empty string keeps other values, missing and null",
    filters: [{ field: "summary", operator: "not", value: "" }],
    expected: ["n5", "n4", "n3", "n1"],
  },
  {
    name: "in matches any listed value",
    filters: [{ field: "summary", operator: "in", values: ["news", ""] }],
    expected: ["n2", "n1"],
  },
  {
    name: "in with duplicates matches once",
    filters: [{ field: "summary", operator: "in", values: ["News", "News"] }],
    expected: ["n5"],
  },
  {
    name: "empty true matches missing and null",
    filters: [{ field: "summary", operator: "empty", empty: true }],
    expected: ["n4", "n3"],
  },
  {
    name: "empty false matches present values including the empty string",
    filters: [{ field: "summary", operator: "empty", empty: false }],
    expected: ["n5", "n2", "n1"],
  },
  {
    name: "contains ignores case",
    filters: [{ field: "summary", operator: "contains", text: "EW" }],
    expected: ["n5", "n1"],
  },
  {
    name: "contains never matches missing, null or a value without the text",
    filters: [{ field: "summary", operator: "contains", text: "s" }],
    expected: ["n5", "n1"],
  },
  {
    name: "several filters combine with AND",
    filters: [
      { field: "summary", operator: "not", value: "news" },
      { field: "summary", operator: "empty", empty: false },
    ],
    expected: ["n5", "n2"],
  },
  {
    name: "filters on different fields combine with AND",
    filters: [
      { field: "summary", operator: "contains", text: "news" },
      { field: "title", operator: "is", value: "n1" },
    ],
    expected: ["n1"],
  },
];

const sortSeeds: DocumentData[] = [
  { title: "zebra", slug: "s1", summary: "zebra" },
  { title: "apple", slug: "s2", summary: "apple" },
  { title: "null-older", slug: "s3", summary: null },
  { title: "\u00c9clair", slug: "s4", summary: "\u00c9clair" },
  { title: "missing", slug: "s5" },
  { title: "Banana", slug: "s6", summary: "Banana" },
  { title: "item10", slug: "s7", summary: "item10" },
  { title: "item2", slug: "s8", summary: "item2" },
  { title: "item1", slug: "s9", summary: "item1" },
  { title: "empty-string", slug: "s10", summary: "" },
  { title: "null-newer", slug: "s11", summary: null },
];

/** Behavior every {@link ContentStore} must share, run once per implementation. */
export function contentStoreContract(name: string, open: OpenStore): void {
  describe(`${name} satisfies the ContentStore contract`, () => {
    test("activation publishes the collections, revision and contracts", () =>
      open(async ({ store, project }) => {
        await store.transaction(project, (transaction) =>
          transaction.activate(collections, publication),
        );
        await store.transaction(project, async (transaction) => {
          expect(await transaction.state()).toEqual({
            revision: publication.revision,
            collections,
          });
          expect(await transaction.contract(publication.contracts.pages)).toEqual(articles);
          expect(await transaction.contract(`v1:${"c".repeat(64)}`)).toBeUndefined();
        });
      }));

    test("documents and reads are scoped to their collection", () =>
      open(async ({ store, project }) => {
        const [article, page] = await store.transaction(project, async (transaction) => {
          await transaction.activate(collections, publication);
          return [
            await transaction.insert("articles", { title: "Article", slug: "article" }, ["slug"]),
            await transaction.insert("pages", { title: "Page", slug: "page" }, ["slug"]),
          ];
        });
        if (!article?.ok || !page?.ok) throw new Error("Expected both inserts to succeed");
        expect(article.data.id).not.toBe(page.data.id);
        await store.transaction(project, async (transaction) => {
          expect(await transaction.documents("articles")).toEqual([article.data]);
          expect(await transaction.documents("pages")).toEqual([page.data]);
          expect(await transaction.read("articles", article.data.id)).toEqual(article.data);
          expect(await transaction.read("pages", article.data.id)).toBeUndefined();
        });
      }));

    test("unique values conflict only within the same collection and field", () =>
      open(async ({ store, project }) => {
        const results = await store.transaction(project, async (transaction) => {
          await transaction.activate(collections, publication);
          return [
            await transaction.insert("articles", { title: "First", slug: "same" }, ["slug"]),
            await transaction.insert("articles", { title: "Second", slug: "same" }, ["slug"]),
            await transaction.insert("pages", { title: "Page", slug: "same" }, ["slug"]),
            await transaction.insert("articles", { title: "First", slug: "other" }, ["slug"]),
          ];
        });
        expect(results.map((result) => (result.ok ? "ok" : result.error))).toEqual([
          "ok",
          { code: "unique_conflict", field: "slug" },
          "ok",
          "ok",
        ]);
        const saved = await store.transaction(project, (transaction) =>
          transaction.documents("articles"),
        );
        expect(saved).toHaveLength(2);
        expect(new Set(saved.map((document) => document.slug))).toEqual(new Set(["other", "same"]));
        expect(new Set(saved.map((document) => document.id)).size).toBe(2);
      }));

    test("a failed operation leaves no changes", () =>
      open(async ({ store, project }) => {
        await store.transaction(project, (transaction) =>
          transaction.activate(collections, publication),
        );
        const failure = new Error("abort-operation");
        await expect(
          store.transaction(project, async (transaction) => {
            await transaction.insert("articles", { title: "Discarded", slug: "discarded" }, []);
            throw failure;
          }),
        ).rejects.toBe(failure);
        expect(
          await store.transaction(project, (transaction) => transaction.documents("articles")),
        ).toEqual([]);
      }));

    describe("R2 R4 replace", () => {
      test("replace keeps the id and stores exactly the new data", () =>
        open(async ({ store, project }) => {
          const [first] = await seeded(store, project, [
            { title: "First", slug: "first", summary: "old" },
          ]);
          const id = first!.id;
          const replaced = await store.transaction(project, (transaction) =>
            transaction.replace("articles", id, { title: "Renamed", slug: "first" }, ["slug"]),
          );
          expect(replaced).toEqual({ ok: true, data: { id, title: "Renamed", slug: "first" } });
          await store.transaction(project, async (transaction) => {
            expect(await transaction.read("articles", id)).toEqual({
              id,
              title: "Renamed",
              slug: "first",
            });
            expect(await transaction.documents("articles")).toEqual([
              { id, title: "Renamed", slug: "first" },
            ]);
          });
        }));

      test("replace releases the old unique value and claims the new one", () =>
        open(async ({ store, project }) => {
          const [first] = await seeded(store, project, [{ title: "First", slug: "a" }]);
          const id = first!.id;
          const results = await store.transaction(project, async (transaction) => [
            await transaction.replace("articles", id, { title: "First", slug: "b" }, ["slug"]),
            await transaction.insert("articles", { title: "Reuses a", slug: "a" }, ["slug"]),
            await transaction.insert("articles", { title: "Takes b", slug: "b" }, ["slug"]),
          ]);
          expect(results.map((result) => (result.ok ? "ok" : result.error))).toEqual([
            "ok",
            "ok",
            { code: "unique_conflict", field: "slug" },
          ]);
        }));

      test("R13 replacing a unique value with null or leaving it out releases it", () =>
        open(async ({ store, project }) => {
          const [first, second] = await seeded(store, project, [
            { title: "First", slug: "a" },
            { title: "Second", slug: "b" },
          ]);
          const results = await store.transaction(project, async (transaction) => [
            await transaction.replace("articles", first!.id, { title: "First" }, ["slug"]),
            await transaction.replace("articles", second!.id, { title: "Second", slug: null }, [
              "slug",
            ]),
            await transaction.insert("articles", { title: "Reuses a", slug: "a" }, ["slug"]),
            await transaction.insert("articles", { title: "Reuses b", slug: "b" }, ["slug"]),
          ]);
          expect(results.map((result) => (result.ok ? "ok" : result.error))).toEqual([
            "ok",
            "ok",
            "ok",
            "ok",
          ]);
        }));

      test("keeping a document's own unique value is not a conflict", () =>
        open(async ({ store, project }) => {
          const [first] = await seeded(store, project, [{ title: "First", slug: "a" }]);
          const id = first!.id;
          expect(
            await store.transaction(project, (transaction) =>
              transaction.replace("articles", id, { title: "Kept slug", slug: "a" }, ["slug"]),
            ),
          ).toEqual({ ok: true, data: { id, title: "Kept slug", slug: "a" } });
        }));

      test("a value held by another document conflicts and changes nothing", () =>
        open(async ({ store, project }) => {
          const [first] = await seeded(store, project, [
            { title: "First", slug: "a" },
            { title: "Second", slug: "b" },
          ]);
          const id = first!.id;
          const replaced = await store.transaction(project, (transaction) =>
            transaction.replace("articles", id, { title: "Changed", slug: "b" }, ["slug"]),
          );
          expect(replaced).toEqual({
            ok: false,
            error: { code: "unique_conflict", field: "slug" },
          });
          await store.transaction(project, async (transaction) => {
            expect(await transaction.read("articles", id)).toEqual({
              id,
              title: "First",
              slug: "a",
            });
            expect(
              await transaction.insert("articles", { title: "Takes a", slug: "a" }, ["slug"]),
            ).toEqual({ ok: false, error: { code: "unique_conflict", field: "slug" } });
          });
        }));

      test("R9 replace keeps the document's creation order", () =>
        open(async ({ store, project }) => {
          const [oldest] = await seeded(store, project, [
            { title: "oldest", slug: "o1" },
            { title: "middle", slug: "o2" },
            { title: "newest", slug: "o3" },
          ]);
          await store.transaction(project, (transaction) =>
            transaction.replace("articles", oldest!.id, { title: "oldest renamed", slug: "o1" }, [
              "slug",
            ]),
          );
          expect(titles(await paged(store, project, newest()))).toEqual([
            "newest",
            "middle",
            "oldest renamed",
          ]);
        }));
    });

    describe("R5 remove", () => {
      test("remove deletes the document, reports it once and frees its unique values", () =>
        open(async ({ store, project }) => {
          const [first, second] = await seeded(store, project, [
            { title: "First", slug: "a" },
            { title: "Second", slug: "b" },
          ]);
          const id = first!.id;
          await store.transaction(project, async (transaction) => {
            expect(await transaction.remove("articles", id)).toBe(true);
            expect(await transaction.remove("articles", id)).toBe(false);
          });
          await store.transaction(project, async (transaction) => {
            expect(await transaction.read("articles", id)).toBeUndefined();
            expect(await transaction.documents("articles")).toEqual([second]);
            expect(
              await transaction.insert("articles", { title: "Reuses a", slug: "a" }, ["slug"]),
            ).toMatchObject({ ok: true, data: { title: "Reuses a", slug: "a" } });
          });
        }));

      test("remove is scoped to its collection and returns false for an unknown id", () =>
        open(async ({ store, project }) => {
          const [first] = await seeded(store, project, [{ title: "First", slug: "a" }]);
          await store.transaction(project, async (transaction) => {
            expect(await transaction.remove("pages", first!.id)).toBe(false);
            expect(
              await transaction.remove("articles", "99999999-9999-4999-8999-999999999999"),
            ).toBe(false);
            expect(await transaction.read("articles", first!.id)).toEqual(first);
            expect(await transaction.remove("articles", first!.id)).toBe(true);
          });
        }));
    });

    describe("R7 R9 page in default order", () => {
      test("documents come newest first with decreasing creation positions", () =>
        open(async ({ store, project }) => {
          await seeded(store, project, [
            { title: "d1", slug: "d1" },
            { title: "d2", slug: "d2" },
            { title: "d3", slug: "d3" },
          ]);
          const page = await paged(store, project, newest());
          expect(titles(page)).toEqual(["d3", "d2", "d1"]);
          expect(page.more).toBe(false);
          expect(page.entries.map((entry) => entry.position)).toEqual([
            { order: "created", created: expect.any(BigInt) },
            { order: "created", created: expect.any(BigInt) },
            { order: "created", created: expect.any(BigInt) },
          ]);
          expect(strictlyDecreasing(createdValues(page))).toBe(true);
        }));

      test("limit bounds the page and more reports further matches", () =>
        open(async ({ store, project }) => {
          await seeded(store, project, [
            { title: "d1", slug: "d1" },
            { title: "d2", slug: "d2" },
            { title: "d3", slug: "d3" },
          ]);
          const short = await paged(store, project, newest(2));
          expect([titles(short), short.more]).toEqual([["d3", "d2"], true]);
          const exact = await paged(store, project, newest(3));
          expect([titles(exact), exact.more]).toEqual([["d3", "d2", "d1"], false]);
          const one = await paged(store, project, newest(1));
          expect([titles(one), one.more]).toEqual([["d3"], true]);
        }));

      test("after continues strictly after the given position", () =>
        open(async ({ store, project }) => {
          await seeded(store, project, [
            { title: "d1", slug: "d1" },
            { title: "d2", slug: "d2" },
            { title: "d3", slug: "d3" },
          ]);
          const first = await paged(store, project, newest(2));
          const after = positionAt(first, 1);
          if (after.order !== "created") throw new Error("Expected a created position");
          const next = await paged(store, project, {
            filters: [],
            order: { by: "created", after },
            limit: 2,
          });
          expect([titles(next), next.more]).toEqual([["d1"], false]);
        }));

      test("R13 a removed anchor document still marks the continuation point", () =>
        open(async ({ store, project }) => {
          const saved = await seeded(store, project, [
            { title: "d1", slug: "d1" },
            { title: "d2", slug: "d2" },
            { title: "d3", slug: "d3" },
          ]);
          const first = await paged(store, project, newest(2));
          const after = positionAt(first, 1);
          if (after.order !== "created") throw new Error("Expected a created position");
          await store.transaction(project, (transaction) =>
            transaction.remove("articles", saved[1]!.id),
          );
          const next = await paged(store, project, {
            filters: [],
            order: { by: "created", after },
            limit: 2,
          });
          expect([titles(next), next.more]).toEqual([["d1"], false]);
        }));

      test("pages are scoped to their collection", () =>
        open(async ({ store, project }) => {
          await seeded(store, project, [{ title: "article", slug: "a" }]);
          await store.transaction(project, (transaction) =>
            transaction.insert("pages", { title: "page", slug: "p" }, ["slug"]),
          );
          const page = await store.transaction(project, (transaction) =>
            transaction.page("pages", newest()),
          );
          expect([titles(page), page.more]).toEqual([["page"], false]);
        }));
    });

    describe("R8 page filters over present, empty string, null and missing values", () => {
      for (const { name, filters, expected } of filterTable)
        test(name, () =>
          open(async ({ store, project }) => {
            await seeded(store, project, filterSeeds);
            const page = await paged(store, project, { ...newest(), filters });
            expect([titles(page), page.more]).toEqual([expected, false]);
          }),
        );
    });

    describe("R9 page field sorts", () => {
      test("ascending sorts by root collation with missing and null last, newest first", () =>
        open(async ({ store, project }) => {
          await seeded(store, project, sortSeeds);
          const page = await paged(store, project, byField("ascending"));
          expect(titles(page)).toEqual([
            "empty-string",
            "apple",
            "Banana",
            "Éclair",
            "item1",
            "item10",
            "item2",
            "zebra",
            "null-newer",
            "missing",
            "null-older",
          ]);
          expect(page.entries.map((entry) => entry.position)).toEqual([
            ...["", "apple", "Banana", "Éclair", "item1", "item10", "item2", "zebra"].map(
              (value) => ({
                order: "field",
                value: { kind: "value", value },
                created: expect.any(BigInt),
              }),
            ),
            ...[1, 2, 3].map(() => ({
              order: "field",
              value: { kind: "empty" },
              created: expect.any(BigInt),
            })),
          ]);
        }));

      test("descending reverses values but keeps missing and null last, newest first", () =>
        open(async ({ store, project }) => {
          await seeded(store, project, sortSeeds);
          expect(titles(await paged(store, project, byField("descending")))).toEqual([
            "zebra",
            "item2",
            "item10",
            "item1",
            "Éclair",
            "Banana",
            "apple",
            "empty-string",
            "null-newer",
            "missing",
            "null-older",
          ]);
        }));

      test("equal values follow the newest-first order in both directions", () =>
        open(async ({ store, project }) => {
          await seeded(store, project, [
            { title: "same-oldest", slug: "t1", summary: "same" },
            { title: "same-middle", slug: "t2", summary: "same" },
            { title: "other", slug: "t3", summary: "other" },
            { title: "same-newest", slug: "t4", summary: "same" },
          ]);
          expect(titles(await paged(store, project, byField("ascending")))).toEqual([
            "other",
            "same-newest",
            "same-middle",
            "same-oldest",
          ]);
          expect(titles(await paged(store, project, byField("descending")))).toEqual([
            "same-newest",
            "same-middle",
            "same-oldest",
            "other",
          ]);
        }));

      for (const direction of ["ascending", "descending"] as const)
        test(`${direction} pages continue after a field position across ties and empties`, () =>
          open(async ({ store, project }) => {
            await seeded(store, project, [
              ...sortSeeds,
              { title: "apple-newer", slug: "s12", summary: "apple" },
            ]);
            const all = titles(await paged(store, project, byField(direction)));
            expect(all).toHaveLength(12);
            const collected: ReturnType<typeof titles> = [];
            let after: ListPosition | undefined;
            for (let index = 0; index < 12; index++) {
              if (after !== undefined && after.order !== "field")
                throw new Error("Expected a field position");
              const page = await paged(store, project, {
                filters: [],
                order: { by: "field", field: "summary", direction, after },
                limit: 5,
              });
              collected.push(...titles(page));
              if (!page.more) break;
              after = positionAt(page, page.entries.length - 1);
            }
            expect(collected).toEqual(all);
          }));

      test("filters and a field sort combine", () =>
        open(async ({ store, project }) => {
          await seeded(store, project, sortSeeds);
          const page = await paged(store, project, {
            filters: [{ field: "summary", operator: "contains", text: "item" }],
            order: { by: "field", field: "summary", direction: "descending", after: undefined },
            limit: 2,
          });
          expect([titles(page), page.more]).toEqual([["item2", "item10"], true]);
        }));
    });

    test("an inactive collection is rejected", () =>
      open(async ({ store, project }) => {
        await store.transaction(project, (transaction) =>
          transaction.activate([{ name: "articles", description: articles }], publication),
        );
        await expect(
          store.transaction(project, (transaction) =>
            transaction.insert("pages", { title: "Page", slug: "page" }, []),
          ),
        ).rejects.toThrow(/Unknown collection/);
        await expect(
          store.transaction(project, (transaction) => transaction.documents("pages")),
        ).rejects.toThrow(/Unknown collection/);
      }));
  });
}
