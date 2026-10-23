import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { postgresAdapter } from "@aircastle/adapter-postgres";
import type { ContentStore } from "@aircastle/core";

export const databaseUrl = () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Run these tests through vp run db:test");
  return url;
};

export async function withDatabase<Value>(
  operation: (fixture: {
    sql: ReturnType<typeof postgres>;
    store: ContentStore;
    namespace: string;
    url: string;
    close: () => Promise<void>;
  }) => Promise<Value>,
  options: { namespace?: string } = {},
): Promise<Value> {
  const url = databaseUrl();
  const namespace = options.namespace ?? `test_${randomUUID().replaceAll("-", "")}`;
  const sql = postgres(url, { max: 5, onnotice: () => {} });
  const store = postgresAdapter({ url, namespace });
  let closed = false;
  const close = async () => {
    if (!closed) {
      closed = true;
      await store.close();
    }
  };
  try {
    return await operation({ sql, store, namespace, url, close });
  } finally {
    await close();
    await sql`DROP SCHEMA IF EXISTS ${sql(namespace)} CASCADE`;
    await sql.end();
  }
}
