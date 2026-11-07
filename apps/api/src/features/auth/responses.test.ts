import { expect, test } from "vite-plus/test";
import { issue, withAuth } from "./test-support/fixture.ts";

function expectPrivate(response: Response, label: string) {
  expect(response.headers.get("cache-control"), label).toContain("no-store");
  expect(response.headers.get("referrer-policy"), label).toBe("no-referrer");
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
