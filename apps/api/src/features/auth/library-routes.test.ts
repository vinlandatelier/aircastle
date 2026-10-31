import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vite-plus/test";
import { localAuthLibrary } from "./library.ts";
import { localAuthPlugin } from "./plugin.ts";
import inventory from "./test-support/library-routes.json";
import { browserOrigin, claim, withAuth } from "./test-support/fixture.ts";

const require = createRequire(import.meta.url);

test("the reviewed route inventory matches the pinned configured Better Auth release", () => {
  for (const name of ["better-auth", "@better-auth/core"]) {
    const manifest = JSON.parse(
      readFileSync(path.resolve(path.dirname(require.resolve(name)), "../package.json"), "utf8"),
    );
    expect(manifest.version).toBe(inventory.version);
  }
  const library = localAuthLibrary({
    origin: browserOrigin,
    secret: "inventory-only-fixed-secret-1234567890",
  });
  const routes = Object.entries(library.api)
    .map(([name, endpoint]) => ({
      name,
      path: "path" in endpoint ? (endpoint.path ?? null) : null,
      methods: Array.isArray(endpoint.options.method)
        ? endpoint.options.method
        : [endpoint.options.method],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  expect(routes).toEqual(inventory.routes);
});

test("the concrete local auth plugin extends the reviewed inventory", () => {
  const unusedOperation = async () => {
    throw new Error("Inventory inspection must not execute authentication operations");
  };
  const library = localAuthLibrary({
    origin: browserOrigin,
    secret: "inventory-only-fixed-secret-1234567890",
    plugin: localAuthPlugin({
      confirm: unusedOperation,
      session: unusedOperation,
      signOut: unusedOperation,
    }),
  });
  const routes = Object.entries(library.api)
    .map(([name, endpoint]) => ({
      name,
      path: "path" in endpoint ? (endpoint.path ?? null) : null,
      methods: Array.isArray(endpoint.options.method)
        ? endpoint.options.method
        : [endpoint.options.method],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  expect(routes).toEqual(
    [...inventory.routes, ...inventory.pluginRoutes].sort((a, b) => a.name.localeCompare(b.name)),
  );
});

for (const completed of [false, true]) {
  test(`every unused configured library route is closed ${completed ? "after" : "before"} setup`, async () => {
    await withAuth(async ({ open }) => {
      const server = await open();
      const cookie = completed ? (await claim(server)).cookie : undefined;
      for (const route of [...inventory.routes, ...inventory.pluginRoutes]) {
        if (!route.path || route.path === "/sign-out") continue;
        const path = route.path.replace(/:[^/]+/g, "attacker-value");
        for (const method of route.methods) {
          const response = await server.app.request(
            `${browserOrigin}/api/auth${path}`,
            {
              method,
              headers: {
                host: new URL(browserOrigin).host,
                origin: browserOrigin,
                "content-type": "application/json",
                ...(cookie ? { cookie } : {}),
              },
              ...(method === "GET"
                ? {}
                : {
                    body: JSON.stringify({
                      email: "attacker@example.test",
                      password: "attacker-password",
                      name: "Attacker",
                      role: "super_user",
                    }),
                  }),
            },
            { peerAddress: "127.0.0.1" },
          );
          expect(response.status, `${method} ${path}`).toBe(404);
          expect(response.headers.get("set-cookie")).toBeNull();
        }
      }
      expect(
        await server.storage.transaction((tx) => tx.userByEmail("attacker@example.test")),
      ).toBeNull();
      if (cookie)
        expect((await server.request("/auth/session", undefined, cookie)).status).toBe(200);
      const logout = await server.request("/auth/sign-out", {}, cookie);
      expect(logout.status).toBe(200);
      expect(await logout.json()).toEqual({ kind: "ok", value: { destination: "/sign-in" } });
    });
  });
}
