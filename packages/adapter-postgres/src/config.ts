import type { PostgresOptions } from "./index.ts";

function parsedUrl(value: string) {
  try {
    return new URL(value);
  } catch (error) {
    if (error instanceof TypeError) return undefined;
    throw error;
  }
}

export function readPostgresOptions(env: Record<string, string | undefined>): PostgresOptions {
  const namespace =
    env.AIRCASTLE_DATABASE_NAMESPACE === undefined
      ? {}
      : { namespace: env.AIRCASTLE_DATABASE_NAMESPACE };
  if (env.AIRCASTLE_DATABASE_URL !== undefined) {
    const url = env.AIRCASTLE_DATABASE_URL;
    const parsed = parsedUrl(url);
    if (
      !parsed ||
      !["postgres:", "postgresql:"].includes(parsed.protocol) ||
      parsed.hash ||
      parsed.hostname.startsWith("[")
    )
      throw new Error(
        "AIRCASTLE_DATABASE_URL must be a Postgres connection URL without an IPv6 host",
      );
    return { url, ...namespace };
  }
  const rawPort = env.AIRCASTLE_DB_PORT ?? "43123";
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("AIRCASTLE_DB_PORT must be an integer from 1 to 65535");
  const rawHost = env.AIRCASTLE_DB_HOST ?? "127.0.0.1";
  const parsedHost =
    rawHost && !/[\s/@?#\\\0:[\]]/u.test(rawHost)
      ? parsedUrl(`postgresql://${rawHost}:${port}`)
      : undefined;
  if (!parsedHost?.hostname)
    throw new Error("AIRCASTLE_DB_HOST must be a hostname or IPv4 address without a port");
  const encoded = (name: string, fallback: string) => {
    const value = env[name] ?? fallback;
    if (!value || value.includes("\0"))
      throw new Error(`${name} must be nonempty text without null bytes`);
    try {
      return encodeURIComponent(value);
    } catch (error) {
      if (!(error instanceof URIError)) throw error;
      throw new Error(`${name} must contain valid Unicode`, { cause: error });
    }
  };
  const user = encoded("AIRCASTLE_DB_USER", "aircastle");
  const password = encoded("AIRCASTLE_DB_PASSWORD", "aircastle-local");
  const database = encoded("AIRCASTLE_DB_NAME", "aircastle");
  return { url: `postgresql://${user}:${password}@${rawHost}:${port}/${database}`, ...namespace };
}
