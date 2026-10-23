import { createHash, randomUUID } from "node:crypto";
import { expect, test } from "vite-plus/test";
import type { Permission, PublishedCollection } from "@aircastle/contracts";
import { postgresAdapter } from "./index.ts";
import { withDatabase } from "../../../tests/support/content-database.ts";
import {
  createForeignSentinel,
  insertDocumentRow,
  insertUniqueValue,
  setFutureVersion,
  snapshotLayout,
} from "./test-support/layout.ts";

const permissions: readonly Permission[] = ["content:read", "content:write", "schema:publish"];
const verifier = createHash("sha256").update("ac_integrity_fixture_secret").digest("hex");
const description = {
  fields: { title: { type: "text" as const, required: true, nullable: false, unique: true } },
};
const collections: PublishedCollection[] = [{ name: "articles", description }];
const contract = `v1:${"1".repeat(64)}`;

for (const location of ["marker", "ledger"] as const) {
  test(`startup refuses a newer ${location} version without modifying stored or foreign data`, async () => {
    await withDatabase(async ({ sql, store, namespace, url, close }) => {
      await store.initialize();
      const project = await store.provision({ verifier, permissions, newKey: false });
      const persisted = await store.transaction(project.project, async (transaction) => {
        await transaction.activate(collections, {
          revision: "before-future-version",
          contracts: { articles: contract },
        });
        return transaction.insert("articles", { title: "Preserved" }, ["title"]);
      });
      expect(persisted.ok).toBe(true);
      await close();
      const sentinel = await createForeignSentinel(sql);
      let reopened: ReturnType<typeof postgresAdapter> | undefined;
      try {
        await setFutureVersion(sql, namespace, location);
        const before = await snapshotLayout(sql, namespace);
        await expect(
          (async () => {
            reopened = postgresAdapter({ url, namespace });
            await reopened.initialize();
          })(),
        ).rejects.toBeInstanceOf(Error);
        expect(await snapshotLayout(sql, namespace)).toEqual(before);
        expect(await sentinel.values()).toEqual(["preserve-foreign-object"]);
      } finally {
        await reopened?.close();
        await sentinel.close();
      }
    });
  });
}

test("database foreign keys independently reject cross-project and cross-collection ownership", async () => {
  await withDatabase(async ({ sql, store, namespace }) => {
    await store.initialize();
    const first = await store.provision({
      verifier,
      permissions,
      newKey: false,
      workspaceName: "FK workspace",
      projectName: "First",
    });
    const second = await store.provision({
      verifier: createHash("sha256").update("second-fk-key").digest("hex"),
      permissions,
      newKey: false,
      workspaceName: "FK workspace",
      projectName: "Second",
    });
    await store.transaction(first.project, (transaction) =>
      transaction.activate([...collections, { name: "private_only", description }], {
        revision: "first-fk",
        contracts: { articles: contract, private_only: contract },
      }),
    );
    await store.transaction(second.project, (transaction) =>
      transaction.activate(collections, {
        revision: "second-fk",
        contracts: { articles: contract },
      }),
    );
    const firstDocument = await store.transaction(first.project, (transaction) =>
      transaction.insert("articles", { title: "Stored first" }, ["title"]),
    );
    expect(firstDocument.ok).toBe(true);
    if (!firstDocument.ok) throw new Error("Expected persisted foreign-key fixture document");
    const directDocument = randomUUID();
    await insertDocumentRow(sql, namespace, {
      id: directDocument,
      project: second.project,
      collection: "articles",
      title: "Direct valid",
    });
    await insertUniqueValue(sql, namespace, {
      project: second.project,
      collection: "articles",
      document: directDocument,
      value: "Direct valid",
    });
    const before = await snapshotLayout(sql, namespace);
    await expect(
      insertDocumentRow(sql, namespace, {
        id: randomUUID(),
        project: randomUUID(),
        collection: "articles",
        title: "Unknown project",
      }),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      insertDocumentRow(sql, namespace, {
        id: randomUUID(),
        project: second.project,
        collection: "private_only",
        title: "Foreign collection",
      }),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      insertUniqueValue(sql, namespace, {
        project: second.project,
        collection: "articles",
        document: firstDocument.data.id,
        value: "Foreign project claim",
      }),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      insertUniqueValue(sql, namespace, {
        project: first.project,
        collection: "private_only",
        document: firstDocument.data.id,
        value: "Foreign collection claim",
      }),
    ).rejects.toMatchObject({ code: "23503" });
    expect(await snapshotLayout(sql, namespace)).toEqual(before);
  });
});
