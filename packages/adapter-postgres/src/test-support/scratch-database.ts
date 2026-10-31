import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { databaseUrl, literalIdentifier } from "./database.ts";

/**
 * Creates an empty database on the test server, passes its URL and a connection to `operation`,
 * then drops it. Use it for changes that must not leak into the shared test database, such as
 * removing a system collation.
 */
export async function withScratchDatabase<Value>(
  operation: (fixture: { sql: ReturnType<typeof postgres>; url: string }) => Promise<Value>,
): Promise<Value> {
  const serverUrl = databaseUrl();
  const name = `scratch_${randomUUID().replaceAll("-", "")}`;
  const admin = postgres(serverUrl, { max: 1, onnotice: () => {} });
  try {
    await admin`CREATE DATABASE ${literalIdentifier(admin, name)} TEMPLATE template0 ENCODING 'UTF8'`;
    const url = new URL(serverUrl);
    url.pathname = `/${name}`;
    const sql = postgres(url.toString(), { max: 2, onnotice: () => {} });
    try {
      return await operation({ sql, url: url.toString() });
    } finally {
      await sql.end();
    }
  } finally {
    try {
      await admin`DROP DATABASE IF EXISTS ${literalIdentifier(admin, name)} WITH (FORCE)`;
    } finally {
      await admin.end();
    }
  }
}
