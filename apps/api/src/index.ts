import pino from "pino";
import { postgresAdapter } from "@aircastle/adapter-postgres";
import { createAircastle } from "@aircastle/core";
import { cmsErrorReporter, createApp } from "./app.ts";
import { readConfig, readDatabaseConfig } from "./config.ts";

const config = readConfig();
const logger = pino({ level: config.AIRCASTLE_LOG_LEVEL });
const database = postgresAdapter(readDatabaseConfig());
const cms = await createAircastle({ database, report: cmsErrorReporter(logger) });
try {
  const app = createApp({ logger, cms, maxRequestBytes: config.AIRCASTLE_MAX_REQUEST_BYTES });
  const server = Bun.serve({ port: config.AIRCASTLE_PORT, fetch: app.fetch });
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
