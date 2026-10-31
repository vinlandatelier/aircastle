import postgres from "postgres";
import { AuthStorageError } from "@aircastle/core";
import type { AuthStore } from "@aircastle/core";
import type { PostgresOptions } from "../index.ts";
import { identifier } from "../identifier.ts";
import { connectionTarget } from "../layout.ts";
import { initializeAuthLayout } from "./layout.ts";
import { authTransaction } from "./transaction.ts";

export async function postgresAuthStore(options: PostgresOptions): Promise<AuthStore> {
  const { url, namespace } = connectionTarget(options);
  const sql = postgres(url, { max: 10, prepare: false, onnotice: () => {} });
  try {
    await sql.begin((transaction) => initializeAuthLayout(transaction, namespace));
  } catch (error) {
    await sql.end({ timeout: 0 });
    throw error;
  }
  const table = (name: string) => identifier(sql, namespace, name);
  let closing: Promise<void> | undefined;
  const pending = new Set<Promise<unknown>>();
  function track<Value>(operation: () => Promise<Value>): Promise<Value> {
    const result = Promise.resolve().then(operation);
    pending.add(result);
    void Promise.allSettled([result]).then(() => pending.delete(result));
    return result;
  }
  function run<Value>(operation: () => Promise<Value>): Promise<Value> {
    return closing ? Promise.reject(new AuthStorageError("unavailable")) : track(operation);
  }
  async function transaction<Value>(
    operation: (sql: postgres.TransactionSql) => Promise<Value>,
  ): Promise<Value> {
    let readyToCommit = false;
    try {
      const result = await sql.begin(async (transactionSql) => {
        const value = await operation(transactionSql);
        readyToCommit = true;
        return { value };
      });
      return result.value;
    } catch (error) {
      if (error instanceof AuthStorageError) throw error;
      throw new AuthStorageError(
        readyToCommit && !(error instanceof postgres.PostgresError)
          ? "commit-unknown"
          : "unavailable",
      );
    }
  }
  return {
    transaction: (operation) =>
      run(() => transaction((sql) => operation(authTransaction(sql, namespace)))),
    signingSecret: () =>
      run(async () => {
        try {
          const [row] = await sql<
            { signing_secret: string }[]
          >`SELECT signing_secret FROM ${table("auth_settings")} WHERE singleton = 1`;
          if (!row) throw new AuthStorageError("unavailable");
          return row.signing_secret;
        } catch (error) {
          throw new AuthStorageError("unavailable", { cause: error });
        }
      }),
    resolveIssuance: ({ messageId, email }) =>
      run(() =>
        transaction(async (sql) => {
          await authTransaction(sql, namespace).lockEmail(email);
          const [row] = await sql<
            { exists: boolean }[]
          >`SELECT EXISTS (SELECT FROM ${table("auth_issuances")} WHERE message_id = ${messageId} AND email = ${email}) AS exists`;
          return row?.exists ? "committed" : "not-committed";
        }),
      ),
    close: () =>
      (closing ??= (async () => {
        while (pending.size) await Promise.allSettled(pending);
        await sql.end({ timeout: 0 });
      })()),
  };
}
