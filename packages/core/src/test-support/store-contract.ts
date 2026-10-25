import type { PublishedCollection } from "@aircastle/contracts";
import { describe, expect, test } from "vite-plus/test";
import type { ContentStore } from "../index.ts";
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
