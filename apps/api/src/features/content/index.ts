import { Hono } from "hono";
import type { ContentService } from "@aircastle/core";

export function contentRoutes(_options: { cms: ContentService; maxRequestBytes?: number }) {
  return new Hono().all("/projects/*", (c) =>
    c.json({ ok: false, error: { code: "unavailable" } }, 503),
  );
}
