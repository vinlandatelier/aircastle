import { createHash, randomUUID } from "node:crypto";
import type postgres from "postgres";
import type { ProjectTransaction } from "@aircastle/core";
import type {
  CollectionDescription,
  ContentDocument,
  DocumentData,
  Result,
} from "@aircastle/contracts";
import { canonicalContract, compileDescription, uniqueFields } from "@aircastle/contracts";
import { identifier } from "./identifier.ts";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

class UniqueConflict extends Error {
  constructor(readonly field: string) {
    super("Unique value already exists");
  }
}

function description(value: string): CollectionDescription {
  try {
    return compileDescription(JSON.parse(value)).describe();
  } catch (error) {
    throw new Error("Invalid persisted collection definition", { cause: error });
  }
}

function document(row: { id: string; data: unknown }): ContentDocument {
  if (row.data === null || typeof row.data !== "object" || Array.isArray(row.data))
    throw new Error("Invalid persisted document object");
  const data: DocumentData = {};
  for (const [field, value] of Object.entries(row.data)) {
    if (field === "id") throw new Error("Invalid persisted document value");
    Object.defineProperty(data, field, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return { ...data, id: row.id };
}

export function projectTransaction(
  sql: postgres.TransactionSql,
  namespace: string,
  project: string,
): ProjectTransaction {
  const table = (name: string) => identifier(sql, namespace, name);
  const collectionKey = (name: string) => hash(name);
  const resolveCollection = async (name: string) => {
    const rows = await sql<
      { name: string }[]
    >`SELECT name FROM ${table("collections")} WHERE project_id = ${project} AND name_key = ${collectionKey(name)}`;
    if (rows[0]?.name !== name)
      throw new Error("Unknown collection or collection name hash collision");
  };
  const claim = async (
    transaction: postgres.TransactionSql,
    collection: string,
    field: string,
    value: string,
    id: string,
  ) => {
    const digest = hash(value);
    const inserted = await transaction<
      { value: string }[]
    >`INSERT INTO ${table("unique_values")} (project_id, collection_name, field, digest, value, document_id) VALUES (${project}, ${collection}, ${field}, ${digest}, ${value}, ${id}) ON CONFLICT (project_id, collection_key, field_key, digest) DO NOTHING RETURNING value`;
    if (inserted.length > 0) return;
    const existing = await transaction<
      { collection_name: string; field: string; value: string }[]
    >`SELECT collection_name, field, value FROM ${table("unique_values")} WHERE project_id = ${project} AND collection_key = ${collectionKey(collection)} AND field_key = ${hash(field)} AND digest = ${digest}`;
    const prior = existing[0];
    if (
      !prior ||
      prior.collection_name !== collection ||
      prior.field !== field ||
      prior.value !== value
    )
      throw new Error("Unique key hash collision");
    throw new UniqueConflict(field);
  };
  const documents = async (collection: string) => {
    await resolveCollection(collection);
    const rows = await sql<
      { id: string; data: unknown }[]
    >`SELECT id, data FROM ${table("documents")} WHERE project_id = ${project} AND collection_key = ${collectionKey(collection)} ORDER BY id`;
    return rows.map(document);
  };
  return {
    state: async () => {
      const projects = await sql<
        { revision: string | null }[]
      >`SELECT revision FROM ${table("projects")} WHERE id = ${project}`;
      if (!projects[0]) throw new Error("Unknown project");
      const rows = await sql<
        { name: string; definition: string }[]
      >`SELECT name, definition FROM ${table("collections")} WHERE project_id = ${project} ORDER BY ordinal`;
      return {
        revision: projects[0].revision,
        collections: rows.map((row) => ({
          name: row.name,
          description: description(row.definition),
        })),
      };
    },
    contract: async (id) => {
      const rows = await sql<
        { definition: string }[]
      >`SELECT definition FROM ${table("contracts")} WHERE project_id = ${project} AND hash = ${id}`;
      return rows[0] ? description(rows[0].definition) : undefined;
    },
    documents,
    activate: async (collections, publication) => {
      for (const [ordinal, collection] of collections.entries()) {
        const existing = await sql<
          { name: string }[]
        >`SELECT name FROM ${table("collections")} WHERE project_id = ${project} AND name_key = ${collectionKey(collection.name)}`;
        if (existing[0] && existing[0].name !== collection.name)
          throw new Error("Collection name hash collision");
        await sql`INSERT INTO ${table("collections")} (project_id, name, ordinal, definition) VALUES (${project}, ${collection.name}, ${ordinal}, ${JSON.stringify(collection.description)}) ON CONFLICT (project_id, name_key) DO UPDATE SET ordinal = excluded.ordinal, definition = excluded.definition`;
        const id = publication.contracts[collection.name];
        if (!id) throw new Error("Missing contract identifier");
        const canonical = canonicalContract(collection.description);
        await sql`INSERT INTO ${table("contracts")} (project_id, hash, definition, canonical) VALUES (${project}, ${id}, ${JSON.stringify(collection.description)}, ${canonical}) ON CONFLICT (project_id, hash) DO NOTHING`;
        const stored = await sql<
          { canonical: string }[]
        >`SELECT canonical FROM ${table("contracts")} WHERE project_id = ${project} AND hash = ${id}`;
        if (stored[0]?.canonical !== canonical)
          throw new Error("Collection contract hash collision");
      }
      await sql`DELETE FROM ${table("unique_values")} WHERE project_id = ${project}`;
      for (const collection of collections) {
        const unique = uniqueFields(collection.description);
        if (unique.length === 0) continue;
        for (const stored of await documents(collection.name)) {
          for (const field of unique) {
            const value = stored[field];
            if (typeof value === "string")
              await claim(sql, collection.name, field, value, stored.id);
          }
        }
      }
      await sql`UPDATE ${table("projects")} SET revision = ${publication.revision} WHERE id = ${project}`;
    },
    insert: async (collection, data, uniqueFields) => {
      await resolveCollection(collection);
      try {
        return await sql.savepoint(async (transaction): Promise<Result<ContentDocument>> => {
          const id = randomUUID();
          await transaction`INSERT INTO ${table("documents")} (id, project_id, collection_name, data) VALUES (${id}, ${project}, ${collection}, ${transaction.json(data)}::jsonb)`;
          for (const field of uniqueFields) {
            const value = data[field];
            if (typeof value === "string") await claim(transaction, collection, field, value, id);
          }
          return { ok: true, data: { ...data, id } };
        });
      } catch (error) {
        if (error instanceof UniqueConflict)
          return { ok: false, error: { code: "unique_conflict", field: error.field } };
        throw error;
      }
    },
    read: async (collection, id) => {
      await resolveCollection(collection);
      const rows = await sql<
        { id: string; data: unknown }[]
      >`SELECT id, data FROM ${table("documents")} WHERE id = ${id} AND project_id = ${project} AND collection_key = ${collectionKey(collection)}`;
      return rows[0] ? document(rows[0]) : undefined;
    },
    existing: async (collection, ids) => {
      if (ids.length === 0) return new Set<string>();
      await resolveCollection(collection);
      const rows = await sql<
        { id: string }[]
      >`SELECT id FROM ${table("documents")} WHERE project_id = ${project} AND collection_key = ${collectionKey(collection)} AND id = ANY(${ids as string[]}::uuid[]) FOR SHARE`;
      return new Set(rows.map((row) => row.id));
    },
  };
}
