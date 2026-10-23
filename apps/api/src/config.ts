import arkenv from "@arkenv/core";

export function readConfig(env: Record<string, string | undefined>) {
  return arkenv(
    {
      PORT: "1 <= number.integer <= 65535 = 43122",
      NODE_ENV: "'development' | 'production' | 'test' = 'development'",
      LOG_LEVEL: "'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent' = 'info'",
    },
    { env, emptyAsUndefined: false },
  );
}
