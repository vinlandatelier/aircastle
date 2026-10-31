import { createHash, randomUUID } from "node:crypto";
import type postgres from "postgres";
import {
  canonicalContract,
  contractId,
  uniqueFields,
  type CollectionDescription,
  type DocumentData,
  type Permission,
} from "@aircastle/contracts";
import type { Access } from "@aircastle/core";
import { identifier } from "../identifier.ts";

type Sql = ReturnType<typeof postgres>;

const digest = (value: string) => createHash("sha256").update(value).digest("hex");

/**
 * Creates a namespace in the version 1 layout exactly as `initializeLayout` wrote it before the
 * creation-order migration. The statements are frozen here so that later layout changes do not
 * change the seed.
 */
export async function createVersionOneLayout(sql: Sql, namespace: string) {
  await sql.begin(async (transaction) => {
    const table = (name: string) => identifier(transaction, namespace, name);
    const nameKey = identifier(transaction, namespace, "name_key");
    await transaction`CREATE SCHEMA ${identifier(transaction, namespace)}`;
    await transaction`CREATE FUNCTION ${nameKey}(value text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS 'SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(value, ''UTF8'')), ''hex'')'`;
    await transaction`CREATE TABLE ${table("ownership")} (singleton integer PRIMARY KEY CHECK (singleton = 1), product text NOT NULL, version integer NOT NULL)`;
    await transaction`CREATE TABLE ${table("migrations")} (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
    await transaction`CREATE TABLE ${table("workspaces")} (id uuid PRIMARY KEY, name text NOT NULL, name_key text GENERATED ALWAYS AS (${nameKey}(name)) STORED UNIQUE)`;
    await transaction`CREATE TABLE ${table("projects")} (id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES ${table("workspaces")}(id), name text NOT NULL, name_key text GENERATED ALWAYS AS (${nameKey}(name)) STORED, revision text NULL, UNIQUE(workspace_id, name_key))`;
    await transaction`CREATE TABLE ${table("keys")} (verifier text PRIMARY KEY, project_id uuid NOT NULL REFERENCES ${table("projects")}(id), permissions jsonb NOT NULL)`;
    await transaction`CREATE TABLE ${table("collections")} (project_id uuid NOT NULL REFERENCES ${table("projects")}(id), name text NOT NULL, name_key text GENERATED ALWAYS AS (${nameKey}(name)) STORED, ordinal integer NOT NULL, definition text NOT NULL, PRIMARY KEY(project_id, name_key))`;
    await transaction`CREATE TABLE ${table("contracts")} (project_id uuid NOT NULL REFERENCES ${table("projects")}(id), hash text NOT NULL, definition text NOT NULL, canonical text NOT NULL, PRIMARY KEY(project_id, hash))`;
    await transaction`CREATE TABLE ${table("documents")} (id uuid PRIMARY KEY, project_id uuid NOT NULL, collection_name text NOT NULL, collection_key text GENERATED ALWAYS AS (${nameKey}(collection_name)) STORED, data jsonb NOT NULL, UNIQUE(id, project_id, collection_key), FOREIGN KEY(project_id, collection_key) REFERENCES ${table("collections")}(project_id, name_key))`;
    await transaction`CREATE TABLE ${table("unique_values")} (project_id uuid NOT NULL, collection_name text NOT NULL, collection_key text GENERATED ALWAYS AS (${nameKey}(collection_name)) STORED, field text NOT NULL, field_key text GENERATED ALWAYS AS (${nameKey}(field)) STORED, digest text NOT NULL, value text COLLATE "C" NOT NULL, document_id uuid NOT NULL, PRIMARY KEY(project_id, collection_key, field_key, digest), FOREIGN KEY(document_id, project_id, collection_key) REFERENCES ${table("documents")}(id, project_id, collection_key))`;
    await transaction`INSERT INTO ${table("ownership")} VALUES (1, 'aircastle', 1)`;
    await transaction`INSERT INTO ${table("migrations")} (version) VALUES (1)`;
  });
}

const permissions: readonly Permission[] = ["content:read", "content:write", "schema:publish"];

/**
 * Writes one project with a published collection and its documents into a version 1 layout, as
 * rows the version 1 adapter would have stored. Returns API access, the collection's contract
 * identifier and each document with its id, in seed order.
 */
export async function seedVersionOneProject(
  sql: Sql,
  namespace: string,
  seed: { collection: string; description: CollectionDescription; documents: DocumentData[] },
) {
  const table = (name: string) => identifier(sql, namespace, name);
  const workspace = randomUUID();
  const project = randomUUID();
  const apiKey = `ac_${randomUUID()}`;
  const definition = JSON.stringify(seed.description);
  const contract = await contractId(seed.description);
  const unique = uniqueFields(seed.description);
  const rows = seed.documents.map((data) => ({ id: randomUUID(), data }));
  await sql.begin(async (transaction) => {
    await transaction`INSERT INTO ${table("workspaces")} (id, name) VALUES (${workspace}, 'Seeded workspace')`;
    await transaction`INSERT INTO ${table("projects")} (id, workspace_id, name, revision) VALUES (${project}, ${workspace}, 'Seeded project', ${randomUUID()})`;
    await transaction`INSERT INTO ${table("keys")} (verifier, project_id, permissions) VALUES (${digest(apiKey)}, ${project}, ${transaction.json([...permissions])}::jsonb)`;
    await transaction`INSERT INTO ${table("collections")} (project_id, name, ordinal, definition) VALUES (${project}, ${seed.collection}, 0, ${definition})`;
    await transaction`INSERT INTO ${table("contracts")} (project_id, hash, definition, canonical) VALUES (${project}, ${contract}, ${definition}, ${canonicalContract(seed.description)})`;
    for (const { id, data } of rows) {
      await transaction`INSERT INTO ${table("documents")} (id, project_id, collection_name, data) VALUES (${id}, ${project}, ${seed.collection}, ${transaction.json(data)}::jsonb)`;
      for (const field of unique) {
        const value = data[field];
        if (typeof value !== "string") continue;
        await transaction`INSERT INTO ${table("unique_values")} (project_id, collection_name, field, digest, value, document_id) VALUES (${project}, ${seed.collection}, ${field}, ${digest(value)}, ${value}, ${id})`;
      }
    }
  });
  const access: Access = { project, apiKey };
  const documents = rows.map(({ id, data }) => ({ ...data, id }));
  return { access, contract, documents };
}

/** Reads the layout ledger and the ownership marker version. */
export async function layoutVersions(sql: Sql, namespace: string) {
  const ledger = await sql<
    { version: number }[]
  >`SELECT version FROM ${identifier(sql, namespace, "migrations")} ORDER BY version`;
  const marker = await sql<
    { version: number }[]
  >`SELECT version FROM ${identifier(sql, namespace, "ownership")} WHERE singleton = 1`;
  return {
    ledger: ledger.map((row) => row.version),
    marker: marker.map((row) => row.version),
  };
}

/** Replaces the layout ledger with the given versions. */
export async function setLedger(sql: Sql, namespace: string, versions: readonly number[]) {
  await sql.begin(async (transaction) => {
    await transaction`DELETE FROM ${identifier(transaction, namespace, "migrations")}`;
    for (const version of versions)
      await transaction`INSERT INTO ${identifier(transaction, namespace, "migrations")} (version) VALUES (${version})`;
  });
}
