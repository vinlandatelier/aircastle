import type postgres from "postgres";

const quoteIdentifier = (value: string) => '"' + value.replaceAll('"', '""') + '"';
export const qualified = (namespace: string, table: string) =>
  `${quoteIdentifier(namespace)}.${quoteIdentifier(table)}`;

type Transaction = postgres.TransactionSql;

export async function initializeLayout(sql: Transaction, namespace: string) {
  await sql`SELECT pg_advisory_xact_lock(hashtextextended(${namespace}, 0))`;
  const existing = await sql<
    { exists: boolean }[]
  >`SELECT EXISTS (SELECT FROM pg_namespace WHERE nspname = ${namespace}) AS exists`;
  const table = (name: string) => qualified(namespace, name);
  if (existing[0]?.exists) {
    const marker = await sql.unsafe<{ product: string; version: number }[]>(
      `SELECT product, version FROM ${table("ownership")} WHERE singleton = 1`,
    );
    if (marker.length !== 1 || marker[0]?.product !== "aircastle" || marker[0].version !== 1)
      throw new Error("Unsupported Aircastle namespace ownership or format");
    const migrations = await sql.unsafe<{ version: number }[]>(
      `SELECT version FROM ${table("migrations")} ORDER BY version`,
    );
    if (migrations.length !== 1 || migrations[0]?.version !== 1)
      throw new Error("Unsupported Aircastle migration version");
    return;
  }
  const encoding = await sql<
    { encoding: string }[]
  >`SELECT current_setting('server_encoding') AS encoding`;
  if (encoding[0]?.encoding !== "UTF8") throw new Error("Aircastle requires a UTF-8 database");
  const ns = quoteIdentifier(namespace);
  await sql.unsafe(`CREATE SCHEMA ${ns}`);
  await sql.unsafe(
    `CREATE FUNCTION ${ns}.name_key(value text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS 'SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(value, ''UTF8'')), ''hex'')'`,
  );
  const hash = (column: string) => `${ns}.name_key(${column})`;
  await sql.unsafe(
    `CREATE TABLE ${table("ownership")} (singleton integer PRIMARY KEY CHECK (singleton = 1), product text NOT NULL, version integer NOT NULL)`,
  );
  await sql.unsafe(
    `CREATE TABLE ${table("migrations")} (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`,
  );
  await sql.unsafe(
    `CREATE TABLE ${table("workspaces")} (id uuid PRIMARY KEY, name text NOT NULL, name_key text GENERATED ALWAYS AS (${hash("name")}) STORED UNIQUE)`,
  );
  await sql.unsafe(
    `CREATE TABLE ${table("projects")} (id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES ${table("workspaces")}(id), name text NOT NULL, name_key text GENERATED ALWAYS AS (${hash("name")}) STORED, revision text NULL, UNIQUE(workspace_id, name_key))`,
  );
  await sql.unsafe(
    `CREATE TABLE ${table("keys")} (verifier text PRIMARY KEY, project_id uuid NOT NULL REFERENCES ${table("projects")}(id), permissions jsonb NOT NULL)`,
  );
  await sql.unsafe(
    `CREATE TABLE ${table("collections")} (project_id uuid NOT NULL REFERENCES ${table("projects")}(id), name text NOT NULL, name_key text GENERATED ALWAYS AS (${hash("name")}) STORED, ordinal integer NOT NULL, definition text NOT NULL, PRIMARY KEY(project_id, name_key))`,
  );
  await sql.unsafe(
    `CREATE TABLE ${table("contracts")} (project_id uuid NOT NULL REFERENCES ${table("projects")}(id), hash text NOT NULL, definition text NOT NULL, canonical text NOT NULL, PRIMARY KEY(project_id, hash))`,
  );
  await sql.unsafe(
    `CREATE TABLE ${table("documents")} (id uuid PRIMARY KEY, project_id uuid NOT NULL, collection_name text NOT NULL, collection_key text GENERATED ALWAYS AS (${hash("collection_name")}) STORED, data jsonb NOT NULL, UNIQUE(id, project_id, collection_key), FOREIGN KEY(project_id, collection_key) REFERENCES ${table("collections")}(project_id, name_key))`,
  );
  await sql.unsafe(
    `CREATE TABLE ${table("unique_values")} (project_id uuid NOT NULL, collection_name text NOT NULL, collection_key text GENERATED ALWAYS AS (${hash("collection_name")}) STORED, field text NOT NULL, field_key text GENERATED ALWAYS AS (${hash("field")}) STORED, digest text NOT NULL, value text COLLATE "C" NOT NULL, document_id uuid NOT NULL, PRIMARY KEY(project_id, collection_key, field_key, digest), FOREIGN KEY(document_id, project_id, collection_key) REFERENCES ${table("documents")}(id, project_id, collection_key))`,
  );
  await sql.unsafe(`INSERT INTO ${table("ownership")} VALUES (1, 'aircastle', 1)`);
  await sql.unsafe(`INSERT INTO ${table("migrations")} (version) VALUES (1)`);
}
