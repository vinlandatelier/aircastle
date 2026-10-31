import arkenv from "@arkenv/core";
import { type } from "arktype";
import { readPostgresOptions } from "@aircastle/adapter-postgres";
import { authEmail } from "@aircastle/contracts";
import type { AuthLimits } from "@aircastle/core";

export type AuthConfig =
  | { mode: "disabled" }
  | { mode: "development"; browserOrigin: string; limits: AuthLimits; initialEmail?: string };

export function readAuthConfig(env: Record<string, string | undefined> = process.env): AuthConfig {
  const mode = env.AIRCASTLE_ENV;
  if (mode === undefined || mode === "" || mode === "production") return { mode: "disabled" };
  if (mode !== "development") throw new Error("AIRCASTLE_ENV must be development or production");
  let origin: URL;
  try {
    origin = new URL(env.AIRCASTLE_URL ?? "");
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    throw new Error("AIRCASTLE_URL must be a loopback HTTP origin", { cause: error });
  }
  if (
    !["http:", "https:"].includes(origin.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    throw new Error("AIRCASTLE_URL must be a loopback HTTP origin");
  const ceiling = (name: string, fallback: number) => {
    const raw = env[name];
    if (raw === undefined) return fallback;
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value <= 0)
      throw new Error(`${name} must be a positive safe integer`);
    return value;
  };
  let initialEmail: string | undefined;
  if (env.AIRCASTLE_INITIAL_SUPER_USER_EMAIL !== undefined) {
    const email = authEmail(env.AIRCASTLE_INITIAL_SUPER_USER_EMAIL);
    if (email instanceof type.errors)
      throw new Error("AIRCASTLE_INITIAL_SUPER_USER_EMAIL must be a valid email address");
    initialEmail = email;
  }
  return {
    mode: "development",
    browserOrigin: origin.origin,
    limits: {
      email: {
        fiveMinutes: ceiling("AIRCASTLE_AUTH_EMAIL_LIMIT_5M", 5),
        oneHour: ceiling("AIRCASTLE_AUTH_EMAIL_LIMIT_1H", 20),
      },
      ip: {
        fiveMinutes: ceiling("AIRCASTLE_AUTH_IP_LIMIT_5M", 10),
        oneHour: ceiling("AIRCASTLE_AUTH_IP_LIMIT_1H", 30),
      },
      global: {
        fiveMinutes: ceiling("AIRCASTLE_AUTH_GLOBAL_LIMIT_5M", 30),
        oneHour: ceiling("AIRCASTLE_AUTH_GLOBAL_LIMIT_1H", 100),
      },
    },
    ...(initialEmail === undefined ? {} : { initialEmail }),
  };
}

export function readDatabaseConfig(env: Record<string, string | undefined> = process.env) {
  return readPostgresOptions(env);
}

export function readConfig(env: Record<string, string | undefined> = process.env) {
  return arkenv(
    {
      AIRCASTLE_PORT: "1 <= number.integer <= 65535 = 43122",
      AIRCASTLE_LOG_LEVEL:
        "'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent' = 'info'",
      AIRCASTLE_MAX_REQUEST_BYTES: "1 <= number.integer <= 9007199254740991 = 1048576",
    },
    { env, emptyAsUndefined: false },
  );
}
