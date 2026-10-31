import pino from "pino";
import {
  postgresAdapter,
  postgresAuthAdmission,
  postgresAuthStore,
} from "@aircastle/adapter-postgres";
import { createAircastle } from "@aircastle/core";
import { cmsErrorReporter, createApp } from "./app.ts";
import { readAuthConfig, readConfig, readDatabaseConfig } from "./config.ts";
import { createAuthEventLogger, createLocalAuth } from "./features/auth/index.ts";
import { createDevelopmentInbox } from "./features/development-inbox/index.ts";
import { createStaticHandler } from "./static.ts";

const config = readConfig();
const authConfig = readAuthConfig();
const logger = pino({ level: config.AIRCASTLE_LOG_LEVEL });
const databaseOptions = readDatabaseConfig();
const cleanup: (() => Promise<void>)[] = [];
let closing: Promise<void> | undefined;
const closeResources = () => {
  closing ??= (async () => {
    const failures: unknown[] = [];
    for (const close of [...cleanup].reverse()) {
      try {
        await close();
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length) throw new AggregateError(failures, "Aircastle cleanup failed");
  })();
  return closing;
};

try {
  const cms = await createAircastle({
    database: postgresAdapter(databaseOptions),
    report: cmsErrorReporter(logger),
  });
  cleanup.push(() => cms.close());
  const auth = await (async () => {
    if (authConfig.mode === "disabled") return createLocalAuth({ config: authConfig });
    const storage = await postgresAuthStore(databaseOptions);
    cleanup.push(() => storage.close());
    const admission = await postgresAuthAdmission({
      ...databaseOptions,
      limits: authConfig.limits,
    });
    cleanup.push(() => admission.close());
    return createLocalAuth({
      config: authConfig,
      storage,
      admission,
      inbox: createDevelopmentInbox(),
      emit: createAuthEventLogger(logger),
    });
  })();
  cleanup.push(() => auth.close());
  const app = createApp({
    logger,
    cms,
    auth,
    maxRequestBytes: config.AIRCASTLE_MAX_REQUEST_BYTES,
  });
  const serveStatic = createStaticHandler({
    root: new URL("../../web/dist/", import.meta.url),
    localAuthEnabled: authConfig.mode === "development",
  });
  const server = Bun.serve({
    hostname: "0.0.0.0",
    port: config.AIRCASTLE_PORT,
    fetch: (request, transport) =>
      /^\/api(?:\/|$)/.test(new URL(request.url).pathname)
        ? app.fetch(request, { peerAddress: transport.requestIP(request)?.address })
        : serveStatic(request),
  });
  cleanup.push(() => server.stop(false));
  const close = () => {
    void closeResources().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  };
  process.on("SIGTERM", close);
  process.on("SIGINT", close);
} catch (error) {
  try {
    await closeResources();
  } catch (cleanupError) {
    throw new AggregateError([error, cleanupError], "Aircastle startup and cleanup failed", {
      cause: cleanupError,
    });
  }
  throw error;
}
