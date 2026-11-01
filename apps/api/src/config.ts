import arkenv from "@arkenv/core";
import { readPostgresOptions } from "@aircastle/adapter-postgres";

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
