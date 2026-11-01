import { createHash, randomUUID } from "node:crypto";
import type postgres from "postgres";
import type { FieldFilter, ListPosition, PageRequest, ProjectTransaction } from "@aircastle/core";
import type {
  CollectionDescription,
  ContentDocument,
  DocumentData,
  Result,
} from "@aircastle/contracts";
import { canonicalContract, parseCollections, uniqueFields } from "@aircastle/contracts";
import { identifier } from "./identifier.ts";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

class UniqueConflict extends Error {
  constructor(readonly field: string) {
    super("Unique value already exists");
  }
}

function description(value: string): CollectionDescription {
  const parsed = parseCollections([{ name: "contract", description: JSON.parse(value) }]);
  if (!parsed.ok || !parsed.data[0]) throw new Error("Invalid persisted collection definition");
  return parsed.data[0].description;
}

function document(row: { id: string; data: unknown }): ContentDocument {
  if (row.data === null || typeof row.data !== "object" || Array.isArray(row.data))
    throw new Error("Invalid persisted document object");
  const data: DocumentData = {};
  for (const [field, value] of Object.entries(row.data)) {
    if (field === "id" || (value !== null && typeof value !== "string"))
      throw new Error("Invalid persisted document value");
    Object.defineProperty(data, field, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return { ...data, id: row.id };
}

function filterCondition(
  sql: postgres.TransactionSql,
  filter: FieldFilter,
): postgres.PendingQuery<postgres.Row[]> {
  const value = sql`(data ->> ${filter.field})`;
  switch (filter.operator) {
    case "is":
      return sql`${value} = ${filter.value} COLLATE "C"`;
    case "not":
      return sql`(${value} = ${filter.value} COLLATE "C") IS NOT TRUE`;
    case "in":
      return sql`${value} COLLATE "C" IN ${sql(filter.values)}`;
    case "empty":
      return filter.empty ? sql`${value} IS NULL` : sql`${value} IS NOT NULL`;
    case "contains":
      return sql`strpos(lower(${value} COLLATE "und-x-icu"), lower(${filter.text} COLLATE "und-x-icu")) > 0`;
  }
}

function pageQuery(sql: postgres.TransactionSql, request: PageRequest) {
  const { order } = request;
  const conditions = request.filters.map((filter) => filterCondition(sql, filter));
  if (order.by === "created") {
    if (order.after) conditions.push(sql`creation_order < ${order.after.created.toString()}`);
    return { conditions, sortValue: sql`NULL::text`, ordering: sql`creation_order DESC` };
  }
  const value = sql`(data ->> ${order.field})`;
  const descending = order.direction === "descending";
  const direction = descending ? sql`DESC` : sql`ASC`;
  const after = order.after;
  if (after) {
    const created = after.created.toString();
    if (after.value.kind === "empty")
      conditions.push(sql`${value} IS NULL AND creation_order < ${created}`);
    else {
      const anchor = after.value.value;
      const beyond = descending
        ? sql`${value} COLLATE "und-x-icu" < ${anchor} OR (${value} COLLATE "und-x-icu" = ${anchor} AND ${value} COLLATE "C" < ${anchor})`
        : sql`${value} COLLATE "und-x-icu" > ${anchor} OR (${value} COLLATE "und-x-icu" = ${anchor} AND ${value} COLLATE "C" > ${anchor})`;
      conditions.push(
        sql`(${value} IS NULL OR ${beyond} OR (${value} COLLATE "C" = ${anchor} AND creation_order < ${created}))`,
      );
    }
  }
  return {
    conditions,
    sortValue: value,
    ordering: sql`${value} IS NULL, ${value} COLLATE "und-x-icu" ${direction}, ${value} COLLATE "C" ${direction}, creation_order DESC`,
  };
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
  const claimAll = async (
    transaction: postgres.TransactionSql,
    collection: string,
    data: DocumentData,
    uniqueFields: readonly string[],
    id: string,
  ) => {
    for (const field of uniqueFields) {
      const value = data[field];
      if (typeof value === "string") await claim(transaction, collection, field, value, id);
    }
  };
  const claimingUniqueValues = async (
    write: (transaction: postgres.TransactionSql) => Promise<ContentDocument>,
  ): Promise<Result<ContentDocument>> => {
    try {
      return { ok: true, data: await sql.savepoint(write) };
    } catch (error) {
      if (error instanceof UniqueConflict)
        return { ok: false, error: { code: "unique_conflict", field: error.field } };
      throw error;
    }
  };
  const documents = async (collection: string) => {
    await resolveCollection(collection);
    const rows = await sql<
      { id: string; data: unknown }[]
    >`SELECT id, data FROM ${table("documents")} WHERE project_id = ${project} AND collection_key = ${collectionKey(collection)} ORDER BY id`;
    return rows.map(document);
  };
  const read = async (collection: string, id: string) => {
    await resolveCollection(collection);
    const rows = await sql<
      { id: string; data: unknown }[]
    >`SELECT id, data FROM ${table("documents")} WHERE id = ${id} AND project_id = ${project} AND collection_key = ${collectionKey(collection)}`;
    return rows[0] ? document(rows[0]) : undefined;
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
      return claimingUniqueValues(async (transaction) => {
        const id = randomUUID();
        await transaction`INSERT INTO ${table("documents")} (id, project_id, collection_name, data) VALUES (${id}, ${project}, ${collection}, ${transaction.json(data)}::jsonb)`;
        await claimAll(transaction, collection, data, uniqueFields, id);
        return { ...data, id };
      });
    },
    read,
    replace: async (collection, id, data, uniqueFields) => {
      await resolveCollection(collection);
      return claimingUniqueValues(async (transaction) => {
        const updated = await transaction<
          { id: string }[]
        >`UPDATE ${table("documents")} SET data = ${transaction.json(data)}::jsonb WHERE id = ${id} AND project_id = ${project} AND collection_key = ${collectionKey(collection)} RETURNING id`;
        const saved = updated[0];
        if (!saved) throw new Error("Unknown document");
        await transaction`DELETE FROM ${table("unique_values")} WHERE project_id = ${project} AND document_id = ${saved.id}`;
        await claimAll(transaction, collection, data, uniqueFields, saved.id);
        return { ...data, id: saved.id };
      });
    },
    remove: async (collection, id) => {
      await resolveCollection(collection);
      await sql`DELETE FROM ${table("unique_values")} WHERE project_id = ${project} AND document_id IN (SELECT id FROM ${table("documents")} WHERE id = ${id} AND project_id = ${project} AND collection_key = ${collectionKey(collection)})`;
      const removed =
        await sql`DELETE FROM ${table("documents")} WHERE id = ${id} AND project_id = ${project} AND collection_key = ${collectionKey(collection)} RETURNING id`;
      return removed.length > 0;
    },
    page: async (collection, request) => {
      await resolveCollection(collection);
      const { conditions, sortValue, ordering } = pageQuery(sql, request);
      const matching = conditions.reduce(
        (all, condition) => sql`${all} AND ${condition}`,
        sql`project_id = ${project} AND collection_key = ${collectionKey(collection)}`,
      );
      const rows = await sql<
        { id: string; data: unknown; creation_order: string; sort_value: string | null }[]
      >`SELECT id, data, creation_order, ${sortValue} AS sort_value FROM ${table("documents")} WHERE ${matching} ORDER BY ${ordering} LIMIT ${request.limit + 1}`;
      const entries = rows.slice(0, request.limit).map((row) => {
        const created = BigInt(row.creation_order);
        const position: ListPosition =
          request.order.by === "created"
            ? { order: "created", created }
            : {
                order: "field",
                value:
                  row.sort_value === null
                    ? { kind: "empty" }
                    : { kind: "value", value: row.sort_value },
                created,
              };
        return { document: document(row), position };
      });
      return { entries, more: rows.length > request.limit };
    },
  };
}
