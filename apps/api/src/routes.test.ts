import { Hono } from "hono";
import pino from "pino";
import { describe, expect, test } from "vite-plus/test";
import type { ContentService } from "@aircastle/core";
import { createApp, routeAccess } from "./app.ts";
import { createLocalAuth } from "./features/auth/index.ts";

const project = "11111111-1111-4111-8111-111111111111";
const contract = `v1:${"1".repeat(64)}`;

async function mountedApp() {
  const calls: string[] = [];
  const refuse = async (operation: string) => {
    calls.push(operation);
    return { ok: false as const, error: { code: "unauthorized" as const } };
  };
  const cms: ContentService = {
    authorize: () => refuse("authorize"),
    schema: () => refuse("schema"),
    publish: () => refuse("publish"),
    create: () => refuse("create"),
    findById: () => refuse("findById"),
  };
  const auth = await createLocalAuth({ config: { mode: "disabled" } });
  const app = createApp({ logger: pino({ level: "silent" }), cms, auth, docsScript: "void 0;" });
  return { app, calls, close: () => auth.close() };
}

type App = Awaited<ReturnType<typeof mountedApp>>["app"];

const key = (method: string, path: string) => `${method} ${path}`;

const handlerChains: Record<keyof typeof routeAccess, readonly string[]> = {
  "ALL /*": ["default deny", "request id", "request logger"],
  "GET /api/health": ["OpenAPI description", "health"],
  "GET /api/openapi.json": ["OpenAPI document"],
  "GET /api/docs": ["Scalar page"],
  "GET /api/docs/scalar.js": ["Scalar script"],
  "ALL /api/auth/*": ["body limit", "auth dispatch"],
  "ALL /api/development-inbox/*": ["auth dispatch"],
  "GET /api/projects/:project/schema": ["OpenAPI description", "read schema"],
  "POST /api/projects/:project/schema": ["OpenAPI description", "publish schema"],
  "POST /api/projects/:project/collections/:collection/documents": [
    "OpenAPI description",
    "create document",
  ],
  "GET /api/projects/:project/collections/:collection/documents/:id": [
    "OpenAPI description",
    "read document",
  ],
};

const classStatus = {
  middleware: 404,
  public: 200,
  "auth-dispatch": 404,
  "development-inbox": 404,
  "project-key": 401,
} as const satisfies Record<(typeof routeAccess)[keyof typeof routeAccess], number>;

const probes: Record<keyof typeof routeAccess, { method: string; path: string; body?: string }[]> =
  {
    "ALL /*": [{ method: "GET", path: "/api/unmounted" }],
    "GET /api/health": [{ method: "GET", path: "/api/health" }],
    "GET /api/openapi.json": [{ method: "GET", path: "/api/openapi.json" }],
    "GET /api/docs": [{ method: "GET", path: "/api/docs" }],
    "GET /api/docs/scalar.js": [{ method: "GET", path: "/api/docs/scalar.js" }],
    "ALL /api/auth/*": [
      { method: "GET", path: "/api/auth/unlisted" },
      { method: "POST", path: "/api/auth/setup", body: "{}" },
      { method: "GET", path: "/api/auth/session" },
    ],
    "ALL /api/development-inbox/*": [
      { method: "GET", path: "/api/development-inbox/messages" },
      { method: "POST", path: "/api/development-inbox/messages/id/open" },
    ],
    "GET /api/projects/:project/schema": [
      { method: "GET", path: `/api/projects/${project}/schema` },
    ],
    "POST /api/projects/:project/schema": [
      {
        method: "POST",
        path: `/api/projects/${project}/schema`,
        body: JSON.stringify({ baseline: null, collections: {} }),
      },
    ],
    "POST /api/projects/:project/collections/:collection/documents": [
      {
        method: "POST",
        path: `/api/projects/${project}/collections/articles/documents`,
        body: JSON.stringify({ title: "Draft" }),
      },
    ],
    "GET /api/projects/:project/collections/:collection/documents/:id": [
      {
        method: "GET",
        path: `/api/projects/${project}/collections/articles/documents/${project}`,
      },
    ],
  };

describe("API route access", () => {
  test("every mounted handler is a named handler of a classified route", async () => {
    const { app, close } = await mountedApp();
    try {
      const mounted = app.routes.map((route) => key(route.method, route.path)).sort();
      const expected = Object.entries(handlerChains)
        .flatMap(([route, handlers]) => handlers.map(() => route))
        .sort();
      expect(mounted).toEqual(expected);
    } finally {
      await close();
    }
  });

  const plants: [string, string, string, (app: App, run: () => Response) => void][] = [
    ["a new path", "GET", "/api/planted", (app, run) => app.get("/planted", run)],
    [
      "a new method on a public path",
      "POST",
      "/api/health",
      (app, run) => app.post("/health", run),
    ],
    [
      "a new method on a project-key path",
      "DELETE",
      `/api/projects/${project}/schema`,
      (app, run) => app.on("DELETE", "/projects/:project/schema", run),
    ],
    [
      "a routed sub-app",
      "GET",
      "/api/sub/planted",
      (app, run) => app.route("/sub", new Hono().get("/planted", run)),
    ],
    [
      "a mounted fetch handler",
      "GET",
      "/api/mounted/planted",
      (app, run) => app.mount("/mounted", run),
    ],
  ];

  test.each(plants)(
    "an unclassified handler on %s never runs",
    async (_label, method, path, plant) => {
      const { app, close } = await mountedApp();
      let ran = false;
      plant(app, () => {
        ran = true;
        return new Response("planted");
      });
      try {
        const response = await app.request(path, { method });
        expect(response.status).toBe(404);
        expect(ran).toBe(false);
      } finally {
        await close();
      }
    },
  );

  test.each(Object.entries(probes))(
    "%s answers a request without credentials as its class requires",
    async (route, requests) => {
      const { app, calls, close } = await mountedApp();
      try {
        for (const probe of requests) {
          for (const cookie of [undefined, "aircastle_session_43121=signed.value"]) {
            const response = await app.request(probe.path, {
              method: probe.method,
              headers: {
                "content-type": "application/json",
                "aircastle-schema": contract,
                ...(cookie ? { cookie } : {}),
              },
              ...(probe.body === undefined ? {} : { body: probe.body }),
            });
            expect(response.status, `${route}: ${probe.method} ${probe.path}`).toBe(
              classStatus[routeAccess[route as keyof typeof routeAccess]],
            );
          }
        }
        expect(calls).toEqual([]);
      } finally {
        await close();
      }
    },
  );
});
