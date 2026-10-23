import { Hono } from "hono";
import { requestId } from "hono/request-id";
import { pinoLogger } from "hono-pino";
import type { Logger } from "pino";

export function createApp({ logger }: { logger: Logger }) {
  return new Hono()
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
    .get("/health", (c) => c.json({ status: "ok" }));
}
