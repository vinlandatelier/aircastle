import app from "./app.ts";

export default {
  port: Number(process.env.PORT ?? 43122),
  fetch: app.fetch,
};
