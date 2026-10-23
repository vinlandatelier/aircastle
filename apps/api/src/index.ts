import pino from "pino";
import { createApp } from "./app.ts";
import { readConfig } from "./config.ts";

const config = readConfig(process.env);
const logger = pino({ level: config.LOG_LEVEL });
const app = createApp({ logger });

export default {
  port: config.PORT,
  fetch: app.fetch,
};
