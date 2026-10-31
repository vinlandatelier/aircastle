import type postgres from "postgres";
import { expect } from "vite-plus/test";
import { literalIdentifier } from "./database.ts";

type Sql = ReturnType<typeof postgres>;

/**
 * Locks a project row from a separate connection, so store transactions for that project queue
 * behind it. Call `release` to commit and free the connection.
 */
export async function holdProjectLock(sql: Sql, namespace: string, project: string) {
  const holder = await sql.reserve();
  await holder`BEGIN`;
  await holder`SELECT id FROM ${literalIdentifier(sql, namespace)}.projects WHERE id = ${project} FOR UPDATE`;
  let released = false;
  return {
    release: async () => {
      if (released) return;
      released = true;
      try {
        await holder`COMMIT`;
      } finally {
        holder.release();
      }
    },
  };
}

/**
 * Takes `LOCK TABLE <namespace>.<table> IN ACCESS EXCLUSIVE MODE` from a separate connection, so
 * every session that reads the table queues behind it. Call `release` to commit and free the
 * connection.
 */
export async function holdTableLock(sql: Sql, namespace: string, table: string) {
  const holder = await sql.reserve();
  await holder`BEGIN`;
  await holder`LOCK TABLE ${literalIdentifier(sql, namespace)}.${literalIdentifier(sql, table)} IN ACCESS EXCLUSIVE MODE`;
  let released = false;
  return {
    release: async () => {
      if (released) return;
      released = true;
      try {
        await holder`COMMIT`;
      } finally {
        holder.release();
      }
    },
  };
}

/**
 * Counts sessions in `pg_stat_activity` waiting on a lock in the current database, limited to
 * queries that mention `namespace` when one is given.
 */
async function lockWaiters(sql: Sql, namespace: string | undefined) {
  const rows = await sql<{ waiting: number }[]>`
    SELECT count(*)::int AS waiting FROM pg_stat_activity
    WHERE datname = current_database() AND pid <> pg_backend_pid()
      AND wait_event_type = 'Lock'
      AND (${namespace ?? null}::text IS NULL OR position(${namespace ?? null}::text in query) > 0)`;
  return rows[0]?.waiting ?? 0;
}

async function awaitWaiters(
  sql: Sql,
  namespace: string | undefined,
  expected: number,
  operations: readonly Promise<unknown>[],
  label: string,
) {
  let settled = false;
  void Promise.race(operations.map((operation) => Promise.allSettled([operation]))).then(() => {
    settled = true;
  });
  const deadline = Date.now() + 10_000;
  let waiting = await lockWaiters(sql, namespace);
  while (waiting !== expected && !settled && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    waiting = await lockWaiters(sql, namespace);
  }
  expect(waiting, label).toBe(expected);
}

/**
 * Waits until `expected` sessions queue on locks in `namespace`, or until one of the operations
 * settles first, and asserts the count. An operation that finishes without touching storage
 * therefore fails the assertion instead of hanging.
 */
export async function expectQueued(
  sql: Sql,
  namespace: string,
  expected: number,
  operations: readonly Promise<unknown>[],
  label: string,
) {
  await awaitWaiters(sql, namespace, expected, operations, label);
}

/**
 * Waits until `expected` sessions queue on any lock in the current database, or until one of the
 * operations settles first, and asserts the count. Use it on a scratch database, where every
 * lock wait belongs to the test, and when the waiting queries do not name the namespace.
 */
export async function expectDatabaseQueued(
  sql: Sql,
  expected: number,
  operations: readonly Promise<unknown>[],
  label: string,
) {
  await awaitWaiters(sql, undefined, expected, operations, label);
}
