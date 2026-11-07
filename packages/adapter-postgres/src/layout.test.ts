import { describe, expect, test } from "vite-plus/test";
import type {
  CollectionDescription,
  ContentDocument,
  DocumentPage,
  Result,
} from "@aircastle/contracts";
import { createService, type Access, type ErrorSummary } from "@aircastle/core";
import { postgresAdapter } from "./index.ts";
import { withDatabase } from "./test-support/database.ts";
import { snapshotLayout } from "./test-support/layout.ts";
import {
  createVersionOneLayout,
  layoutVersions,
  seedVersionOneProject,
  setLedger,
} from "./test-support/layout-v1.ts";
import { expectDatabaseQueued, holdTableLock } from "./test-support/project-lock.ts";
import { withScratchDatabase } from "./test-support/scratch-database.ts";

const articles: CollectionDescription = {
  fields: {
    title: { type: "text", required: true, nullable: false, unique: false },
    slug: { type: "text", required: true, nullable: false, unique: true },
  },
};
const seeds = [
  { title: "Seed one", slug: "seed-one" },
  { title: "Seed two", slug: "seed-two" },
  { title: "Seed three", slug: "seed-three" },
  { title: "Seed four", slug: "seed-four" },
];

const failOnReport = (summary: ErrorSummary) => {
  throw summary;
};

function listedIds(result: Result<DocumentPage>) {
  expect(result).toEqual({ ok: true, data: { documents: expect.any(Array), next: null } });
  if (!result.ok) throw new Error("Expected a page");
  return result.data.documents.map((document) => document.id);
}

function byId(documents: readonly ContentDocument[]) {
  return new Map(documents.map((document) => [document.id, document]));
}

describe("R12 R13 version 1 to version 2 migration", () => {
  test("startup moves the ledger to [1,2] and keeps the ownership marker at 1", async () => {
    await withDatabase(async ({ sql, store, namespace }) => {
      await createVersionOneLayout(sql, namespace);
      await seedVersionOneProject(sql, namespace, {
        collection: "articles",
        description: articles,
        documents: seeds,
      });
      await store.initialize();
      expect(await layoutVersions(sql, namespace)).toEqual({ ledger: [1, 2], marker: [1] });
      await store.initialize();
      expect(await layoutVersions(sql, namespace)).toEqual({ ledger: [1, 2], marker: [1] });
    });
  });

  test("migrated documents keep one stable order and later documents list as newer", async () => {
    await withDatabase(async ({ sql, store, namespace, url }) => {
      await createVersionOneLayout(sql, namespace);
      const seeded = await seedVersionOneProject(sql, namespace, {
        collection: "articles",
        description: articles,
        documents: seeds,
      });
      await store.initialize();
      const cms = createService(store, failOnReport);
      const list = (access: Access, limit?: number, cursor?: string) =>
        cms.list(access, "articles", seeded.contract, {
          ...(limit === undefined ? {} : { limit }),
          ...(cursor === undefined ? {} : { cursor }),
        });
      const first = await list(seeded.access);
      expect(first).toEqual({
        ok: true,
        data: { documents: expect.arrayContaining(seeded.documents), next: null },
      });
      const migratedOrder = listedIds(first);
      expect(migratedOrder).toHaveLength(seeds.length);
      expect(listedIds(await list(seeded.access))).toEqual(migratedOrder);
      const paged: string[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < seeds.length; page += 1) {
        const last = page === seeds.length - 1;
        const result = await list(seeded.access, 1, cursor);
        expect(result).toEqual({
          ok: true,
          data: { documents: [expect.any(Object)], next: last ? null : expect.any(String) },
        });
        if (!result.ok) break;
        paged.push(...result.data.documents.map((document) => document.id));
        if (result.data.next === null) break;
        cursor = result.data.next;
      }
      expect(paged).toEqual(migratedOrder);

      const reopened = postgresAdapter({ url, namespace });
      try {
        await reopened.initialize();
        const reopenedCms = createService(reopened, failOnReport);
        expect(
          listedIds(await reopenedCms.list(seeded.access, "articles", seeded.contract, {})),
        ).toEqual(migratedOrder);
      } finally {
        await reopened.close();
      }

      const older = await cms.create(seeded.access, "articles", seeded.contract, {
        title: "After one",
        slug: "after-one",
      });
      const newer = await cms.create(seeded.access, "articles", seeded.contract, {
        title: "After two",
        slug: "after-two",
      });
      expect(older).toEqual({
        ok: true,
        data: { id: expect.any(String), title: "After one", slug: "after-one" },
      });
      expect(newer).toEqual({
        ok: true,
        data: { id: expect.any(String), title: "After two", slug: "after-two" },
      });
      if (!older.ok || !newer.ok) return;
      const documents = byId([...seeded.documents, older.data, newer.data]);
      expect(await list(seeded.access)).toEqual({
        ok: true,
        data: {
          documents: [newer.data.id, older.data.id, ...migratedOrder].map((id) =>
            documents.get(id),
          ),
          next: null,
        },
      });
    });
  });

  test("concurrent startups on a version 1 namespace queue, migrate it once and keep one order", async () => {
    await withScratchDatabase(async ({ sql, url }) => {
      const namespace = "aircastle_concurrent_startup";
      await createVersionOneLayout(sql, namespace);
      const seeded = await seedVersionOneProject(sql, namespace, {
        collection: "articles",
        description: articles,
        documents: seeds,
      });
      const primary = postgresAdapter({ url, namespace });
      const stores = [
        primary,
        postgresAdapter({ url, namespace }),
        postgresAdapter({ url, namespace }),
      ];
      const lock = await holdTableLock(sql, namespace, "migrations");
      try {
        const startups = stores.map((store) => store.initialize());
        await expectDatabaseQueued(sql, 3, startups, "three startups queue behind the lock");
        await lock.release();
        expect(await Promise.allSettled(startups)).toEqual([
          { status: "fulfilled", value: undefined },
          { status: "fulfilled", value: undefined },
          { status: "fulfilled", value: undefined },
        ]);
        expect(await layoutVersions(sql, namespace)).toEqual({ ledger: [1, 2], marker: [1] });
        const cms = createService(primary, failOnReport);
        const result = await cms.list(seeded.access, "articles", seeded.contract, {});
        expect(result).toEqual({
          ok: true,
          data: { documents: expect.arrayContaining(seeded.documents), next: null },
        });
        const migratedOrder = listedIds(result);
        expect(migratedOrder).toHaveLength(seeds.length);
        const created = await cms.create(seeded.access, "articles", seeded.contract, {
          title: "After startups",
          slug: "after-startups",
        });
        expect(created).toEqual({
          ok: true,
          data: { id: expect.any(String), title: "After startups", slug: "after-startups" },
        });
        if (!created.ok) return;
        const restarted = postgresAdapter({ url, namespace });
        try {
          await restarted.initialize();
          expect(await layoutVersions(sql, namespace)).toEqual({ ledger: [1, 2], marker: [1] });
          expect(
            listedIds(
              await createService(restarted, failOnReport).list(
                seeded.access,
                "articles",
                seeded.contract,
                {},
              ),
            ),
          ).toEqual([created.data.id, ...migratedOrder]);
        } finally {
          await restarted.close();
        }
      } finally {
        await lock.release();
        await Promise.all(stores.map((store) => store.close()));
      }
    });
  });

  for (const ledger of [[1, 3], [2]]) {
    test(`startup fails on ledger [${ledger.join(",")}] and changes nothing`, async () => {
      await withDatabase(async ({ sql, store, namespace }) => {
        await createVersionOneLayout(sql, namespace);
        await seedVersionOneProject(sql, namespace, {
          collection: "articles",
          description: articles,
          documents: seeds,
        });
        await setLedger(sql, namespace, ledger);
        const before = await snapshotLayout(sql, namespace);
        await expect(store.initialize()).rejects.toBeInstanceOf(Error);
        expect(await snapshotLayout(sql, namespace)).toEqual(before);
        expect(await layoutVersions(sql, namespace)).toEqual({ ledger, marker: [1] });
      });
    });
  }

  test("a server without the root ICU collation fails startup before migrating", async () => {
    await withScratchDatabase(async ({ sql, url }) => {
      await sql`DROP COLLATION pg_catalog."und-x-icu"`;
      expect(
        await sql`SELECT collname FROM pg_collation WHERE collname = 'und-x-icu'`,
      ).toHaveLength(0);
      const namespace = "aircastle_icu_check";
      await createVersionOneLayout(sql, namespace);
      await seedVersionOneProject(sql, namespace, {
        collection: "articles",
        description: articles,
        documents: seeds,
      });
      const before = await snapshotLayout(sql, namespace);
      const store = postgresAdapter({ url, namespace });
      try {
        await expect(store.initialize()).rejects.toThrow(/ICU/);
      } finally {
        await store.close();
      }
      expect(await layoutVersions(sql, namespace)).toEqual({ ledger: [1], marker: [1] });
      expect(await snapshotLayout(sql, namespace)).toEqual(before);
    });
  });
  test("startup checks the root ICU collation on every start, after migrating too", async () => {
    await withScratchDatabase(async ({ sql, url }) => {
      const namespace = "aircastle_icu_restart";
      await createVersionOneLayout(sql, namespace);
      await seedVersionOneProject(sql, namespace, {
        collection: "articles",
        description: articles,
        documents: seeds,
      });
      const first = postgresAdapter({ url, namespace });
      try {
        await first.initialize();
      } finally {
        await first.close();
      }
      expect(await layoutVersions(sql, namespace)).toEqual({ ledger: [1, 2], marker: [1] });
      await sql`DROP COLLATION pg_catalog."und-x-icu"`;
      expect(
        await sql`SELECT collname FROM pg_collation WHERE collname = 'und-x-icu'`,
      ).toHaveLength(0);
      const before = await snapshotLayout(sql, namespace);
      const second = postgresAdapter({ url, namespace });
      try {
        await expect(second.initialize()).rejects.toThrow(/ICU/);
      } finally {
        await second.close();
      }
      expect(await layoutVersions(sql, namespace)).toEqual({ ledger: [1, 2], marker: [1] });
      expect(await snapshotLayout(sql, namespace)).toEqual(before);
    });
  });
});
