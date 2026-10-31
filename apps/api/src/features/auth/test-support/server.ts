import pino from "pino";
import {
  postgresAdapter,
  postgresAuthAdmission,
  postgresAuthStore,
} from "@aircastle/adapter-postgres";
import { createAircastle } from "@aircastle/core";
import { cmsErrorReporter, createApp } from "../../../app.ts";
import { createLocalAuth } from "../index.ts";
import { createDevelopmentInbox } from "../../development-inbox/index.ts";
import type { LocalAuthConfig } from "../index.ts";

const database = {
  url: process.env.AIRCASTLE_DATABASE_URL ?? "",
  ...(process.env.AIRCASTLE_DATABASE_NAMESPACE === undefined
    ? {}
    : { namespace: process.env.AIRCASTLE_DATABASE_NAMESPACE }),
};
let now = Number(process.env.AUTH_TEST_NOW ?? Date.UTC(2026, 0, 1));
if (!Number.isSafeInteger(now)) throw new Error("AUTH_TEST_NOW must be Unix milliseconds");
const config: LocalAuthConfig =
  process.env.AIRCASTLE_ENV === "development"
    ? {
        mode: "development",
        browserOrigin: process.env.AIRCASTLE_URL ?? "",
        limits: {
          email: {
            fiveMinutes: Number(process.env.AIRCASTLE_AUTH_EMAIL_LIMIT_5M ?? 5),
            oneHour: Number(process.env.AIRCASTLE_AUTH_EMAIL_LIMIT_1H ?? 20),
          },
          ip: {
            fiveMinutes: Number(process.env.AIRCASTLE_AUTH_IP_LIMIT_5M ?? 10),
            oneHour: Number(process.env.AIRCASTLE_AUTH_IP_LIMIT_1H ?? 30),
          },
          global: {
            fiveMinutes: Number(process.env.AIRCASTLE_AUTH_GLOBAL_LIMIT_5M ?? 30),
            oneHour: Number(process.env.AIRCASTLE_AUTH_GLOBAL_LIMIT_1H ?? 100),
          },
        },
        ...(process.env.AIRCASTLE_INITIAL_SUPER_USER_EMAIL === undefined
          ? {}
          : { initialEmail: process.env.AIRCASTLE_INITIAL_SUPER_USER_EMAIL }),
      }
    : { mode: "disabled" };
const logger = pino({ level: "silent" });
const content = postgresAdapter(database);
const cms = await createAircastle({ database: content, report: cmsErrorReporter(logger) });
const storage = config.mode === "development" ? await postgresAuthStore(database) : undefined;
const admission =
  config.mode === "development"
    ? await postgresAuthAdmission({ ...database, limits: config.limits, clock: () => now })
    : undefined;
const inbox = createDevelopmentInbox();
const auth = await createLocalAuth(
  config.mode === "disabled"
    ? { config }
    : {
        config: { ...config, browserOrigin: process.env.AIRCASTLE_URL ?? "" },
        storage: storage!,
        admission: admission!,
        clock: () => now,
        inbox,
        emit: () => {},
      },
);
const app = createApp({ logger, cms, auth });
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: (request, transport) =>
    app.fetch(request, {
      peerAddress: transport.requestIP(request)?.address,
    }),
});
const origin = `http://127.0.0.1:${server.port}`;
console.log(`AIRCASTLE_TEST_URL=${origin}`);
process.send?.({ kind: "ready", origin });
process.on("message", (message: unknown) => {
  if (typeof message !== "object" || message === null || !("kind" in message)) return;
  if (message.kind === "inbox" && "id" in message) {
    process.send?.({ kind: "inbox", id: message.id, entries: inbox.list() });
    return;
  }
  if (message.kind !== "advance" || !("milliseconds" in message) || !("id" in message)) return;
  if (
    typeof message.milliseconds !== "number" ||
    !Number.isSafeInteger(message.milliseconds) ||
    message.milliseconds < 0
  )
    return;
  now += message.milliseconds;
  process.send?.({ kind: "advanced", id: message.id });
});
let closing: Promise<void> | undefined;
const close = () => {
  closing ??= (async () => {
    await server.stop(true);
    await auth.close();
    await admission?.close();
    await storage?.close();
    await cms.close();
  })();
  void Promise.allSettled([closing]).then(([outcome]) =>
    process.exit(outcome?.status === "fulfilled" ? 0 : 1),
  );
};
process.on("SIGTERM", close);
process.on("SIGINT", close);
process.on("disconnect", close);
