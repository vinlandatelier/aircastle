import { createHash, randomUUID } from "node:crypto";
import type postgres from "postgres";
import { expect } from "vite-plus/test";

type Sql = ReturnType<typeof postgres>;

export async function setFutureVersion(sql: Sql, namespace: string, location: "marker" | "ledger") {
  const rows =
    location === "marker"
      ? await sql<
          { version: number }[]
        >`UPDATE ${sql(namespace)}.ownership SET version = 2 WHERE singleton = 1 RETURNING version`
      : await sql<
          { version: number }[]
        >`INSERT INTO ${sql(namespace)}.migrations (version) VALUES (2) RETURNING version`;
  expect(rows.map((row) => row.version)).toEqual([2]);
}

export async function snapshotLayout(sql: Sql, namespace: string) {
  const snapshot: Record<string, unknown[]> = {};
  for (const table of [
    "ownership",
    "migrations",
    "workspaces",
    "projects",
    "keys",
    "collections",
    "contracts",
    "documents",
    "unique_values",
  ]) {
    const rows = await sql<
      { value: unknown }[]
    >`SELECT to_jsonb(record) AS value FROM ${sql(namespace)}.${sql(table)} AS record ORDER BY to_jsonb(record)::text`;
    snapshot[table] = rows.map((row) => row.value);
  }
  return snapshot;
}

export async function createForeignSentinel(sql: Sql) {
  const namespace = `foreign_${randomUUID().replaceAll("-", "")}`;
  await sql`CREATE SCHEMA ${sql(namespace)}`;
  await sql`CREATE TABLE ${sql(namespace)}.sentinel (value text NOT NULL)`;
  await sql`INSERT INTO ${sql(namespace)}.sentinel VALUES ('preserve-foreign-object')`;
  return {
    values: async () =>
      (await sql<{ value: string }[]>`SELECT value FROM ${sql(namespace)}.sentinel`).map(
        (row) => row.value,
      ),
    close: async () => {
      await sql`DROP SCHEMA IF EXISTS ${sql(namespace)} CASCADE`;
    },
  };
}

export async function insertDocumentRow(
  sql: Sql,
  namespace: string,
  document: {
    id: string;
    project: string;
    collection: string;
    title: string;
  },
) {
  await sql`INSERT INTO ${sql(namespace)}.documents (id, project_id, collection_name, data) VALUES (${document.id}, ${document.project}, ${document.collection}, ${sql.json({ title: document.title })})`;
}

export async function insertUniqueValue(
  sql: Sql,
  namespace: string,
  claim: {
    project: string;
    collection: string;
    document: string;
    value: string;
  },
) {
  const digest = createHash("sha256").update(claim.value).digest("hex");
  await sql`INSERT INTO ${sql(namespace)}.unique_values (project_id, collection_name, field, digest, value, document_id) VALUES (${claim.project}, ${claim.collection}, 'title', ${digest}, ${claim.value}, ${claim.document})`;
}
