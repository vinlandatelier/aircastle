import pino from "pino";
import { describe, expect, test } from "vite-plus/test";
import { createApp } from "./app.ts";

function captureLogs(level: "info" | "error" | "silent" = "info") {
  const lines: string[] = [];
  const logger = pino({ level }, { write: (line) => lines.push(line) });
  return { logger, lines };
}

describe("API", () => {
  test("serves health and correlates its response with one structured log", async () => {
    const { logger, lines } = captureLogs();
    const app = createApp({ logger });
    const response = await app.request("/health");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ status: "ok" });
    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      level: 30,
      reqId: response.headers.get("x-request-id"),
      req: { method: "GET", path: "/health" },
      res: { status: 200 },
      responseTime: expect.any(Number),
    });
  });

  test("logs unknown routes without credentials, query values, or bodies", async () => {
    const { logger, lines } = captureLogs();
    const app = createApp({ logger });
    const response = await app.request("/missing?token=query-secret", {
      method: "POST",
      headers: {
        authorization: "Bearer auth-secret",
        cookie: "session=cookie-secret",
        "x-request-id": "client-request-123",
      },
      body: "body-secret",
    });

    expect(response.status).toBe(404);
    expect(response.headers.get("x-request-id")).toBe("client-request-123");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      reqId: "client-request-123",
      req: { method: "POST", path: "/missing" },
      res: { status: 404 },
    });
    for (const secret of ["query-secret", "auth-secret", "cookie-secret", "body-secret"]) {
      expect(lines.join("")).not.toContain(secret);
    }
  });

  test("returns a generic 500 and logs an unexpected error once", async () => {
    const { logger, lines } = captureLogs();
    const app = createApp({ logger });
    app.get("/broken", () => {
      throw new Error("internal failure detail");
    });
    const response = await app.request("/broken");

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal server error" });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      level: 50,
      reqId: response.headers.get("x-request-id"),
      res: { status: 500 },
      err: { message: "internal failure detail", stack: expect.any(String) },
    });
  });

  test("concurrent requests receive distinct correlated IDs", async () => {
    const { logger, lines } = captureLogs();
    const app = createApp({ logger });
    const responses = await Promise.all([app.request("/health"), app.request("/missing")]);
    const ids = responses.map((response) => response.headers.get("x-request-id"));

    expect(new Set(ids).size).toBe(2);
    expect(new Set(lines.map((line) => JSON.parse(line).reqId))).toEqual(new Set(ids));
  });

  test.each(["error", "silent"] as const)("honors the %s log level", async (level) => {
    const { logger, lines } = captureLogs(level);
    await createApp({ logger }).request("/health");
    expect(lines).toEqual([]);
  });
});

describe("API documentation", () => {
  test("publishes the health response schema as OpenAPI 3.1", async () => {
    const { logger } = captureLogs("silent");
    const response = await createApp({ logger }).request("/openapi.json");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    const spec = await response.json();
    expect(spec).toMatchObject({
      openapi: expect.stringMatching(/^3\.1\./),
      info: { title: "Aircastle API", version: "0.0.0" },
    });
    expect(spec).toHaveProperty("paths", { "/health": expect.any(Object) });
    expect(spec).toMatchObject({
      paths: {
        "/health": {
          get: {
            operationId: "getHealth",
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      required: ["status"],
                      properties: { status: { const: "ok" } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
  });

  test("serves Scalar with the local spec and a pinned UI asset", async () => {
    const { logger } = captureLogs("silent");
    const response = await createApp({ logger }).request("/docs");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain("Aircastle API");
    expect(html).toContain("/openapi.json");
    expect(html).toContain("https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.76.0");
    expect(html).not.toContain("@latest");
  });
});
