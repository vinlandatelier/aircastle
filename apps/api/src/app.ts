import { Scalar } from "@scalar/hono-api-reference";
import { Hono } from "hono";
import { requestId } from "hono/request-id";
import { openAPIRouteHandler } from "hono-openapi";
import { pinoLogger } from "hono-pino";
import type { Logger } from "pino";
import { health } from "./features/health/index.ts";

export function createApp({ logger }: { logger: Logger }) {
  const app = new Hono()
    .use(requestId())
    .use(
      pinoLogger({
        pino: logger,
        http: {
          onReqBindings: (c) => ({
            reqId: c.get("requestId"),
            req: { method: c.req.method, path: c.req.path },
          }),
          onResBindings: (c) => ({
            res: { status: c.res.status },
            ...(c.error ? { err: c.error } : {}),
          }),
          onResLevel: (c) => (c.res.status >= 500 ? "error" : "info"),
          onResMessage: () => "Request completed",
        },
      }),
    )
    .onError((_error, c) => c.json({ error: "Internal server error" }, 500))
    .route("/", health);

  return app
    .get(
      "/openapi.json",
      openAPIRouteHandler(app, {
        documentation: {
          info: { title: "Aircastle API", version: "0.0.0" },
        },
      }),
    )
    .get(
      "/docs",
      Scalar({
        url: "/openapi.json",
        pageTitle: "Aircastle API",
        cdn: "https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.76.0/dist/browser/standalone.js",
      }),
    );
}
