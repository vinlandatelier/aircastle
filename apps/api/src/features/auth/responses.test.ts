import { expect, test } from "vite-plus/test";
import { browserOrigin, claim, issue, withAuth } from "./test-support/fixture.ts";
import type { AuthServer } from "./test-support/fixture.ts";

function expectPrivate(response: Response, label: string) {
  expect(response.headers.get("cache-control"), label).toContain("no-store");
  expect(response.headers.get("referrer-policy"), label).toBe("no-referrer");
}

function rawPost(
  server: AuthServer,
  path: string,
  contentType: string,
  body: string,
  cookie?: string,
) {
  return server.app.request(
    `${browserOrigin}/api${path}`,
    {
      method: "POST",
      headers: {
        host: new URL(browserOrigin).host,
        origin: browserOrigin,
        "content-type": contentType,
        ...(cookie ? { cookie } : {}),
      },
      body,
    },
    { peerAddress: "127.0.0.1" },
  );
}

test("confirm, session, activity, entry and sign-out responses are neither cached nor referred", async () => {
  await withAuth(async ({ open }) => {
    const server = await open();
    const link = await issue(server);
    const confirmed = await server.request("/auth/confirm", {
      purpose: link.purpose,
      token: link.token,
    });
    expect(confirmed.status).toBe(200);
    expectPrivate(confirmed, "confirm");
    const cookie = confirmed.headers.get("set-cookie")?.split(";")[0] ?? "";
    const reused = await server.request("/auth/confirm", {
      purpose: link.purpose,
      token: link.token,
    });
    expect(reused.status).toBe(400);
    expectPrivate(reused, "confirm failure");
    for (const [label, response, status] of [
      ["session", await server.request("/auth/session", undefined, cookie), 200],
      ["session failure", await server.request("/auth/session"), 401],
      ["activity", await server.request("/auth/activity", {}, cookie), 200],
      ["activity failure", await server.request("/auth/activity", {}), 401],
      ["entry", await server.request("/auth/entry", { kind: "resolve" }, cookie), 200],
      ["entry failure", await server.request("/auth/entry", { kind: "resolve" }), 401],
      ["sign-out", await server.request("/auth/sign-out", {}, cookie), 200],
      ["repeated sign-out", await server.request("/auth/sign-out", {}, cookie), 200],
    ] as const) {
      expect(response.status, label).toBe(status);
      expectPrivate(response, label);
    }
  });
});

for (const contentType of ["text/plain", "application/x-www-form-urlencoded"]) {
  test(`confirm sent as ${contentType} returns the contracted invalid-link envelope`, async () => {
    await withAuth(async ({ open }) => {
      const server = await open();
      const response = await rawPost(
        server,
        "/auth/confirm",
        contentType,
        JSON.stringify({ purpose: "setup", token: "A".repeat(43) }),
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ kind: "invalid-link", next: "setup" });
      expect(response.headers.get("set-cookie")).toBeNull();
    });
  });

  test(`activity and entry sent as ${contentType} without a session return unauthenticated`, async () => {
    await withAuth(async ({ open }) => {
      const server = await open();
      for (const path of ["/auth/activity", "/auth/entry"]) {
        const response = await rawPost(server, path, contentType, "kind=resolve");
        expect(response.status, path).toBe(401);
        expect(await response.json(), path).toEqual({ kind: "unauthenticated" });
      }
    });
  });

  test(`activity and entry sent as ${contentType} with a session keep the contracted envelopes`, async () => {
    await withAuth(async ({ open }) => {
      const server = await open();
      const { cookie } = await claim(server);
      const activity = await rawPost(server, "/auth/activity", contentType, "kind=resolve", cookie);
      expect(activity.status).toBe(200);
      expect(await activity.json()).toMatchObject({
        kind: "ok",
        value: { user: { name: "Alex" } },
      });
      const entry = await rawPost(server, "/auth/entry", contentType, "kind=resolve", cookie);
      expect(entry.status).toBe(400);
      expect(await entry.json()).toEqual({ kind: "invalid-input" });
    });
  });
}
