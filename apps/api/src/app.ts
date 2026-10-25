import { Scalar } from "@scalar/hono-api-reference";
import { Hono } from "hono";
import { requestId } from "hono/request-id";
import { openAPIRouteHandler } from "hono-openapi";
import { pinoLogger } from "hono-pino";
import type { Logger } from "pino";
import { ErrorSummary, type ContentService, type ReportError } from "@aircastle/core";
import { contentRoutes } from "./features/content/index.ts";
import { health } from "./features/health/index.ts";

/** Logs the summary of each unexpected CMS error. */
export function cmsErrorReporter(logger: Logger): ReportError {
  return (summary) => logger.error({ err: summary }, "Unexpected CMS error");
}

export function createApp({
  logger,
  cms,
  maxRequestBytes,
}: {
  logger: Logger;
  cms?: ContentService;
  maxRequestBytes?: number;
}) {
  const app = new Hono()
    .use(requestId())
    .use(
      pinoLogger({
        pino: logger,
        http: {
          onReqBindings: (c) => ({
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
    .onError((error, c) => {
      c.error = ErrorSummary.of(error);
      return c.json({ error: "Internal server error" }, 500);
    })
    .basePath("/api")
    .route("/", health);

  if (cms)
    app.route(
      "/",
      contentRoutes({ cms, ...(maxRequestBytes === undefined ? {} : { maxRequestBytes }) }),
    );

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
        url: "/api/openapi.json",
        pageTitle: "Aircastle API",
        cdn: "https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.76.0/dist/browser/standalone.js",
      }),
    );
}
