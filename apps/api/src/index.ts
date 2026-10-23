import app from "./app.ts";
import { readConfig } from "./config.ts";

const config = readConfig(process.env);

export default {
  port: config.PORT,
  fetch: app.fetch,
};
