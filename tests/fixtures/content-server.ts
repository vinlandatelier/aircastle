import pino from "pino";
import { postgresAdapter } from "@aircastle/adapter-postgres";
import { createAircastle } from "@aircastle/core";
import { cmsErrorReporter, createApp } from "../../apps/api/src/app.ts";

const database = postgresAdapter({
  url: process.env.DATABASE_URL ?? "",
  namespace: process.env.AIRCASTLE_DATABASE_NAMESPACE ?? "aircastle_test",
});
const logger = pino({ level: "silent" });
const cms = await createAircastle({ database, report: cmsErrorReporter(logger) });
const app = createApp({ logger, cms });
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: app.fetch });
console.log(`AIRCASTLE_TEST_URL=${server.url.href.replace(/\/$/, "")}`);
let closing = false;
const close = async () => {
  if (closing) return;
  closing = true;
  await server.stop(false);
  await cms.close();
  process.exit(0);
};
process.on("SIGTERM", () => {
  void close();
});
process.on("SIGINT", () => {
  void close();
});
