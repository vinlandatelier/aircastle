import { Scalar } from "@scalar/hono-api-reference";
import { Hono, type Context } from "hono";
import { requestId } from "hono/request-id";
import { bodyLimit } from "hono/body-limit";
import { openAPIRouteHandler } from "hono-openapi";
import { pinoLogger } from "hono-pino";
import { except } from "hono/combine";
import type { Logger } from "pino";
import { ErrorSummary, type ContentService, type ReportError } from "@aircastle/core";
import { contentRoutes } from "./features/content/index.ts";
import { health } from "./features/health/index.ts";
import type { LocalAuthRuntime } from "./features/auth/index.ts";

/** Logs the summary of each unexpected CMS error. */
export function cmsErrorReporter(logger: Logger): ReportError {
  return (summary) => logger.error({ err: summary }, "Unexpected CMS error");
}

export function createApp({
  logger,
  cms,
  maxRequestBytes = 1_048_576,
  auth,
  docsScript,
}: {
  logger: Logger;
  cms?: ContentService;
  maxRequestBytes?: number;
  auth?: LocalAuthRuntime;
  /** The Scalar UI bundle served at `/api/docs/scalar.js`, so the docs page loads no CDN script. */
  docsScript?: string;
}) {
  const ordinaryLogger = pinoLogger({
    pino: logger,
    http: {
      onReqBindings: (c) => ({ req: { method: c.req.method, path: c.req.path } }),
      onResBindings: (c) => ({
        res: { status: c.res.status },
        ...(c.error ? { err: c.error } : {}),
      }),
      onResLevel: (c) => (c.res.status >= 500 ? "error" : "info"),
      onResMessage: () => "Request completed",
    },
  });
  const credentialBearingPath = (c: Context) =>
    c.req.path.startsWith("/api/auth/") || c.req.path.startsWith("/api/development-inbox/");
  const app = new Hono<{ Bindings: { peerAddress?: string } }>()
    .use(requestId())
    .use(except(credentialBearingPath, ordinaryLogger))
    .onError((error, c) => {
      c.error = ErrorSummary.of(error);
      if (!credentialBearingPath(c)) return c.json({ error: "Internal server error" }, 500);
      logger.error({ err: c.error }, "Unexpected auth error");
      return c.json({ kind: "temporary-failure" }, 500, {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      });
    })
    .basePath("/api")
    .route("/", health);

  if (auth) {
    app.all(
      "/auth/*",
      bodyLimit({
        maxSize: maxRequestBytes,
        onError: (c) => c.json({ kind: "request-too-large" }, 413),
      }),
      (c) => auth.handle(c.req.raw, { address: c.env?.peerAddress }),
    );
    app.all("/development-inbox/*", (c) => auth.handle(c.req.raw, { address: c.env?.peerAddress }));
  }

  if (cms) app.route("/", contentRoutes({ cms, maxRequestBytes }));

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
      Scalar({ url: "/api/openapi.json", pageTitle: "Aircastle API", cdn: "/api/docs/scalar.js" }),
    )
    .get("/docs/scalar.js", (c) =>
      docsScript === undefined
        ? c.notFound()
        : c.body(docsScript, 200, { "Content-Type": "text/javascript; charset=utf-8" }),
    );
}
