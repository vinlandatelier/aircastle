import arkenv from "@arkenv/core";

export function readConfig(env: Record<string, string | undefined> = process.env) {
  return arkenv(
    {
      PORT: "1 <= number.integer <= 65535 = 43122",
      LOG_LEVEL: "'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent' = 'info'",
      DATABASE_URL: "string > 0",
      "AIRCASTLE_DATABASE_NAMESPACE?": "string",
      AIRCASTLE_MAX_REQUEST_BYTES: "1 <= number.integer <= 9007199254740991 = 1048576",
    },
    { env, emptyAsUndefined: false },
  );
}
