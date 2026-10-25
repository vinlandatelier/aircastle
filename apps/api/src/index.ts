import pino from "pino";
import { postgresAdapter } from "@aircastle/adapter-postgres";
import { createAircastle } from "@aircastle/core";
import { cmsErrorReporter, createApp } from "./app.ts";
import { readConfig } from "./config.ts";

const config = readConfig(process.env);
const logger = pino({ level: config.LOG_LEVEL });
const database = postgresAdapter({
  url: process.env.DATABASE_URL ?? "",
  ...(process.env.AIRCASTLE_DATABASE_NAMESPACE === undefined
    ? {}
    : { namespace: process.env.AIRCASTLE_DATABASE_NAMESPACE }),
});
const cms = await createAircastle({ database, report: cmsErrorReporter(logger) });
try {
  const configuredLimit = process.env.AIRCASTLE_MAX_REQUEST_BYTES;
  const maxRequestBytes = configuredLimit === undefined ? 1_048_576 : Number(configuredLimit);
  const app = createApp({ logger, cms, maxRequestBytes });
  const server = Bun.serve({ port: config.PORT, fetch: app.fetch });
  let closing: Promise<void> | undefined;
  const close = () => {
    closing ??= (async () => {
      const stopped = server.stop(false);
      await cms.close();
      await stopped;
    })();
    void closing.then(
      () => process.exit(0),
      () => process.exit(1),
    );
  };
  process.on("SIGTERM", close);
  process.on("SIGINT", close);
} catch (error) {
  await cms.close();
  throw error;
}
