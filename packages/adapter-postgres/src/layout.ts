import type postgres from "postgres";
import { identifier } from "./identifier.ts";

type Transaction = postgres.TransactionSql;

export async function initializeLayout(sql: Transaction, namespace: string) {
  await sql`SELECT pg_advisory_xact_lock(hashtextextended(${namespace}, 0))`;
  const rootCollation = await sql<
    { exists: boolean }[]
  >`SELECT EXISTS (SELECT FROM pg_catalog.pg_collation WHERE collname = 'und-x-icu' AND collnamespace = 'pg_catalog'::regnamespace) AS exists`;
  if (!rootCollation[0]?.exists)
    throw new Error(
      'Aircastle requires a Postgres server built with ICU: the root ICU collation pg_catalog."und-x-icu" is missing',
    );
  const existing = await sql<
    { exists: boolean }[]
  >`SELECT EXISTS (SELECT FROM pg_namespace WHERE nspname = ${namespace}) AS exists`;
  const table = (name: string) => identifier(sql, namespace, name);
  const addCreationOrder = async () => {
    await sql`ALTER TABLE ${table("documents")} ADD COLUMN creation_order bigint GENERATED ALWAYS AS IDENTITY`;
    await sql`CREATE INDEX ON ${table("documents")} (project_id, collection_key, creation_order)`;
    await sql`INSERT INTO ${table("migrations")} (version) VALUES (2)`;
  };
  if (existing[0]?.exists) {
    const marker = await sql<
      { product: string; version: number }[]
    >`SELECT product, version FROM ${table("ownership")} WHERE singleton = 1`;
    if (marker.length !== 1 || marker[0]?.product !== "aircastle" || marker[0].version !== 1)
      throw new Error("Unsupported Aircastle namespace ownership or format");
    const migrations = await sql<
      { version: number }[]
    >`SELECT version FROM ${table("migrations")} ORDER BY version`;
    const ledger = migrations.map((row) => row.version).join(",");
    if (ledger === "1") await addCreationOrder();
    else if (ledger !== "1,2") throw new Error("Unsupported Aircastle migration version");
    return;
  }
  const encoding = await sql<
    { encoding: string }[]
  >`SELECT current_setting('server_encoding') AS encoding`;
  if (encoding[0]?.encoding !== "UTF8") throw new Error("Aircastle requires a UTF-8 database");
  const nameKey = identifier(sql, namespace, "name_key");
  await sql`CREATE SCHEMA ${identifier(sql, namespace)}`;
  await sql`CREATE FUNCTION ${nameKey}(value text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS 'SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(value, ''UTF8'')), ''hex'')'`;
  await sql`CREATE TABLE ${table("ownership")} (singleton integer PRIMARY KEY CHECK (singleton = 1), product text NOT NULL, version integer NOT NULL)`;
  await sql`CREATE TABLE ${table("migrations")} (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE TABLE ${table("workspaces")} (id uuid PRIMARY KEY, name text NOT NULL, name_key text GENERATED ALWAYS AS (${nameKey}(name)) STORED UNIQUE)`;
  await sql`CREATE TABLE ${table("projects")} (id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES ${table("workspaces")}(id), name text NOT NULL, name_key text GENERATED ALWAYS AS (${nameKey}(name)) STORED, revision text NULL, UNIQUE(workspace_id, name_key))`;
  await sql`CREATE TABLE ${table("keys")} (verifier text PRIMARY KEY, project_id uuid NOT NULL REFERENCES ${table("projects")}(id), permissions jsonb NOT NULL)`;
  await sql`CREATE TABLE ${table("collections")} (project_id uuid NOT NULL REFERENCES ${table("projects")}(id), name text NOT NULL, name_key text GENERATED ALWAYS AS (${nameKey}(name)) STORED, ordinal integer NOT NULL, definition text NOT NULL, PRIMARY KEY(project_id, name_key))`;
  await sql`CREATE TABLE ${table("contracts")} (project_id uuid NOT NULL REFERENCES ${table("projects")}(id), hash text NOT NULL, definition text NOT NULL, canonical text NOT NULL, PRIMARY KEY(project_id, hash))`;
  await sql`CREATE TABLE ${table("documents")} (id uuid PRIMARY KEY, project_id uuid NOT NULL, collection_name text NOT NULL, collection_key text GENERATED ALWAYS AS (${nameKey}(collection_name)) STORED, data jsonb NOT NULL, UNIQUE(id, project_id, collection_key), FOREIGN KEY(project_id, collection_key) REFERENCES ${table("collections")}(project_id, name_key))`;
  await sql`CREATE TABLE ${table("unique_values")} (project_id uuid NOT NULL, collection_name text NOT NULL, collection_key text GENERATED ALWAYS AS (${nameKey}(collection_name)) STORED, field text NOT NULL, field_key text GENERATED ALWAYS AS (${nameKey}(field)) STORED, digest text NOT NULL, value text COLLATE "C" NOT NULL, document_id uuid NOT NULL, PRIMARY KEY(project_id, collection_key, field_key, digest), FOREIGN KEY(document_id, project_id, collection_key) REFERENCES ${table("documents")}(id, project_id, collection_key))`;
  await sql`INSERT INTO ${table("ownership")} VALUES (1, 'aircastle', 1)`;
  await sql`INSERT INTO ${table("migrations")} (version) VALUES (1)`;
  await addCreationOrder();
}
