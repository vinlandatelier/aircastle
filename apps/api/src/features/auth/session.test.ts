import { expect, test } from "vite-plus/test";
import { claim, signIn, start, withAuth } from "./test-support/fixture.ts";

const fortnight = 1_209_600_000;

for (const cookie of [undefined, "better-auth.session_token=forged.secret"]) {
  test(`session read rejects ${cookie === undefined ? "missing" : "forged"} cookie independently of setup`, async () => {
    await withAuth(async ({ open }) => {
      const server = await open();
      const response = await server.request("/auth/session", undefined, cookie);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ kind: "unauthenticated" });
      expect(response.headers.get("set-cookie")).toBeNull();
    });
  });

  test(`foreground renewal rejects ${cookie === undefined ? "missing" : "forged"} cookie independently of setup`, async () => {
    await withAuth(async ({ open }) => {
      const server = await open();
      const response = await server.request("/auth/activity", {}, cookie);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ kind: "unauthenticated" });
    });
  });
}

test("sign-out with no session succeeds repeatedly without admitting the browser", async () => {
  await withAuth(async ({ open }) => {
    const server = await open();
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await server.request("/auth/sign-out", {});
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ kind: "ok", value: { destination: "/sign-in" } });
      expect((await server.request("/auth/session")).status).toBe(401);
    }
  });
});

test("confirmation issues an HttpOnly host-only Lax cookie and a secret-free session projection", async () => {
  await withAuth(async ({ open }) => {
    const server = await open();
    const { cookie, setCookie } = await claim(server);
    expect(setCookie).toMatch(/;\s*HttpOnly(?:;|$)/iu);
    expect(setCookie).toMatch(/;\s*SameSite=Lax(?:;|$)/iu);
    expect(setCookie).not.toMatch(/;\s*Domain=/iu);
    expect(setCookie).not.toMatch(/;\s*Secure(?:;|$)/iu);
    const response = await server.request("/auth/session", undefined, cookie);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      kind: "ok",
      value: {
        user: {
          id: expect.any(String),
          name: "Alex",
          email: "alex@example.test",
          authority: "super_user",
        },
        expiresAt: start + fortnight,
      },
    });
  });
});

for (const elapsed of [fortnight - 1, fortnight, fortnight + 1]) {
  test(`session expires strictly at 14 days with read polls at ${elapsed} milliseconds`, async () => {
    await withAuth(async ({ open, at }) => {
      const server = await open();
      const { cookie } = await claim(server);
      at(fortnight - 10);
      const poll = await server.request("/auth/session", undefined, cookie);
      expect(poll.status).toBe(200);
      expect(poll.headers.get("set-cookie")).toBeNull();
      expect(await poll.json()).toMatchObject({ value: { expiresAt: start + fortnight } });
      at(elapsed);
      const response = await server.request("/auth/session", undefined, cookie);
      expect(response.status).toBe(elapsed < fortnight ? 200 : 401);
      if (elapsed >= fortnight) {
        expect((await server.request("/auth/activity", {}, cookie)).status).toBe(401);
      }
    });
  });
}

test("foreground activity renews exactly from its operation time while reads and inbox polls do not", async () => {
  await withAuth(async ({ open, at }) => {
    const server = await open();
    const { cookie } = await claim(server);
    at(12_345);
    const poll = await server.request("/auth/session", undefined, cookie);
    expect(await poll.json()).toMatchObject({ value: { expiresAt: start + fortnight } });
    await server.request("/development-inbox/messages");
    const renewed = await server.request("/auth/activity", {}, cookie);
    expect(renewed.status).toBe(200);
    expect(await renewed.json()).toMatchObject({
      value: { expiresAt: start + 12_345 + fortnight },
    });
    expect(renewed.headers.get("set-cookie")).toBeTruthy();
    at(fortnight);
    expect((await server.request("/auth/session", undefined, cookie)).status).toBe(200);
  });
});

test("server-side logout revokes the cookie and is safe to repeat", async () => {
  await withAuth(async ({ open }) => {
    const server = await open();
    const { cookie } = await claim(server);
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await server.request("/auth/sign-out", {}, cookie);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ kind: "ok", value: { destination: "/sign-in" } });
      expect(response.headers.get("set-cookie")).toMatch(
        /(?:Max-Age=0|Expires=Thu, 01 Jan 1970)/iu,
      );
    }
    expect((await server.request("/auth/session", undefined, cookie)).status).toBe(401);
    expect((await server.request("/auth/activity", {}, cookie)).status).toBe(401);
  });
});

test("recreated runtime retains the signed cookie and durable session while clearing its inbox", async () => {
  await withAuth(async ({ open }) => {
    const first = await open();
    const { cookie } = await claim(first);
    await first.auth.close();
    const reopened = await open();
    const response = await reopened.request("/auth/session", undefined, cookie);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      value: { user: { email: "alex@example.test" } },
    });
    expect(reopened.inbox.list()).toHaveLength(0);
  });
});

test("orphaned sessions cannot read or renew after user deletion", async () => {
  await withAuth(async ({ open, sql, namespace }) => {
    const server = await open();
    const { cookie } = await claim(server);
    const user = await server.storage.transaction((tx) => tx.userByEmail("alex@example.test"));
    expect(user).not.toBeNull();
    if (!user) throw new Error("Claim must persist user");
    await sql`DELETE FROM ${sql(namespace)}.auth_users WHERE id = ${user.id}`;
    expect((await server.request("/auth/session", undefined, cookie)).status).toBe(401);
    expect((await server.request("/auth/activity", {}, cookie)).status).toBe(401);
    expect((await server.request("/auth/entry", { kind: "resolve" }, cookie)).status).toBe(401);
  });
});

test("logout revokes only the current browser session", async () => {
  await withAuth(async ({ open }) => {
    const server = await open();
    const first = await claim(server);
    const second = await signIn(server);
    expect((await server.request("/auth/sign-out", {}, first.cookie)).status).toBe(200);
    expect((await server.request("/auth/session", undefined, first.cookie)).status).toBe(401);
    expect((await server.request("/auth/session", undefined, second.cookie)).status).toBe(200);
  });
});
