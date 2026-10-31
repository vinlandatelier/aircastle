import postgres from "postgres";
import { AuthStorageError } from "@aircastle/core";
import type {
  AuthAdmission,
  AuthAdmissionStore,
  AuthLimits,
  AuthLimitScope,
} from "@aircastle/core";
import type { PostgresOptions } from "./index.ts";
import { identifier } from "./identifier.ts";
import { validatedNamespace } from "./layout.ts";
import { initializeAuthLayout } from "./auth/layout.ts";

const windows = [
  ["fiveMinutes", 300_000],
  ["oneHour", 3_600_000],
] as const;
const scopes = ["email", "ip", "global"] as const;

export async function postgresAuthAdmission(
  options: PostgresOptions & { limits: AuthLimits; clock?: () => number },
): Promise<AuthAdmissionStore> {
  const namespace = validatedNamespace(
    options.namespace === undefined ? "aircastle" : options.namespace,
  );
  if (typeof options.url !== "string" || options.url.length === 0)
    throw new Error("Postgres URL is required");
  const limits: AuthLimits = {
    email: { ...options.limits.email },
    ip: { ...options.limits.ip },
    global: { ...options.limits.global },
  };
  for (const scope of scopes)
    for (const [window] of windows)
      if (!Number.isSafeInteger(limits[scope][window]) || limits[scope][window] <= 0)
        throw new Error(`Invalid auth limits: ${scope}.${window}`);
  const policy = JSON.stringify(
    scopes.map((scope) => windows.map(([window]) => limits[scope][window])),
  );
  const operationKey = JSON.stringify([namespace, "auth-admission"]);
  const policyKey = JSON.stringify([namespace, "auth-admission-policy"]);
  const sql = postgres(options.url, {
    max: 1,
    prepare: false,
    idle_timeout: 0,
    max_lifetime: 0,
    onnotice: () => {},
  });
  const table = (name: string) => identifier(sql, namespace, name);
  const clock = options.clock ?? Date.now;
  async function lockOperation(transaction: postgres.TransactionSql) {
    await transaction`SELECT pg_advisory_xact_lock(hashtextextended(${operationKey}, 0))`;
  }
  async function matchesPolicy(transaction: postgres.TransactionSql) {
    const [row] = await transaction<
      { policy: string }[]
    >`SELECT policy FROM ${table("auth_admission_policy")} WHERE singleton = 1`;
    return row?.policy === policy;
  }
  try {
    await sql.begin(async (transaction) => {
      await initializeAuthLayout(transaction, namespace);
      await lockOperation(transaction);
      const [lock] = await transaction<{ acquired: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(hashtextextended(${policyKey}, 0)) AS acquired`;
      if (lock?.acquired) {
        await transaction`INSERT INTO ${table("auth_admission_policy")} (singleton, policy) VALUES (1, ${policy}) ON CONFLICT (singleton) DO UPDATE SET policy = EXCLUDED.policy`;
      } else if (!(await matchesPolicy(transaction))) {
        throw new Error("Auth admission limits conflict with the active namespace policy");
      }
      await transaction`SELECT pg_advisory_lock_shared(hashtextextended(${policyKey}, 0))`;
    });
  } catch (error) {
    await sql.end({ timeout: 5 });
    throw error;
  }
  let closing: Promise<void> | undefined;
  return {
    admit: async ({ source, email }) => {
      if (closing) throw new AuthStorageError("unavailable");
      try {
        return await sql.begin(async (transaction): Promise<AuthAdmission> => {
          await lockOperation(transaction);
          await transaction`SELECT pg_advisory_xact_lock_shared(hashtextextended(${policyKey}, 0))`;
          if (!(await matchesPolicy(transaction))) throw new AuthStorageError("unavailable");
          const now = clock();
          await transaction`DELETE FROM ${table("auth_admission_events")} WHERE admitted_at <= ${now - 3_600_000}`;
          const events = await transaction<
            { scope: AuthLimitScope; admitted_at: string }[]
          >`SELECT scope, admitted_at FROM ${table("auth_admission_events")} WHERE (scope = 'global' AND identity = '') OR (scope = 'ip' AND identity = ${source}) OR (scope = 'email' AND identity = ${email ?? null}) ORDER BY admitted_at`;
          function exhausted(
            checked: AuthLimitScope[],
          ): Extract<AuthAdmission, { kind: "throttled" }> | undefined {
            const blocked: AuthLimitScope[] = [];
            let retryAt = now;
            for (const scope of checked) {
              const times = events
                .filter((event) => event.scope === scope)
                .map((event) => Number(event.admitted_at));
              let denied = false;
              for (const [window, duration] of windows) {
                const retained = times.filter((time) => time > now - duration);
                const ceiling = limits[scope][window];
                if (retained.length >= ceiling) {
                  denied = true;
                  retryAt = Math.max(retryAt, retained[retained.length - ceiling]! + duration);
                }
              }
              if (denied) blocked.push(scope);
            }
            if (blocked.length) return { kind: "throttled", retryAt, scopes: blocked };
          }
          const outer = exhausted(["ip", "global"]);
          if (outer) {
            const recipient = email === undefined ? undefined : exhausted(["email"]);
            if (recipient) outer.retryAt = Math.max(outer.retryAt, recipient.retryAt);
            return outer;
          }
          await transaction`INSERT INTO ${table("auth_admission_events")} (scope, identity, admitted_at) VALUES ('ip', ${source}, ${now}), ('global', '', ${now})`;
          events.push(
            { scope: "ip", admitted_at: String(now) },
            { scope: "global", admitted_at: String(now) },
          );
          if (email !== undefined) {
            const recipient = exhausted(["email"]);
            if (recipient) {
              const chargedOuter = exhausted(["ip", "global"]);
              if (chargedOuter)
                recipient.retryAt = Math.max(recipient.retryAt, chargedOuter.retryAt);
              return recipient;
            }
            await transaction`INSERT INTO ${table("auth_admission_events")} (scope, identity, admitted_at) VALUES ('email', ${email}, ${now})`;
          }
          return { kind: "admitted" };
        });
      } catch (error) {
        throw new AuthStorageError("unavailable", { cause: error });
      }
    },
    close: () => (closing ??= sql.end({ timeout: 5 })),
  };
}
