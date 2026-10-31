import { expect, test } from "vite-plus/test";
import { claim, withAuth } from "./test-support/fixture.ts";
import { deadline, waitForBlock } from "./test-support/postgres-wire.ts";
import { holdSession } from "./test-support/session-lock.ts";

test("foreground renewal cannot renew a session that expires while waiting for its database lock", async () => {
  await withAuth(async ({ open, sql, namespace, at }) => {
    const server = await open();
    const { cookie } = await claim(server);
    const held = await holdSession(sql, namespace);
    let activity: Promise<Response> | undefined;
    try {
      at(1_209_599_999);
      activity = server.request("/auth/activity", {}, cookie);
      expect(await waitForBlock(sql, held.pid)).toBeGreaterThan(0);
      at(1_209_600_000);
      held.release();
      await held.done;
      const response = await deadline(activity, "Activity never resumed after lock release");
      expect(response.status).toBe(401);
      expect(response.headers.get("set-cookie")).toBeNull();
      expect((await server.request("/auth/session", undefined, cookie)).status).toBe(401);
    } finally {
      held.release();
      await held.done;
      await activity;
    }
  });
});

test("deleting a user during a blocked renewal cannot restore an orphaned session", async () => {
  await withAuth(async ({ open, sql, namespace }) => {
    const server = await open();
    const { cookie } = await claim(server);
    const held = await holdSession(sql, namespace);
    let activity: Promise<Response> | undefined;
    try {
      activity = server.request("/auth/activity", {}, cookie);
      expect(await waitForBlock(sql, held.pid)).toBeGreaterThan(0);
      held.release("delete-user");
      await held.done;
      const response = await deadline(activity, "Activity never resumed after user deletion");
      expect(response.status).toBe(401);
      expect((await server.request("/auth/session", undefined, cookie)).status).toBe(401);
    } finally {
      held.release();
      await held.done;
      await activity;
    }
  });
});

test("logout ordered ahead of renewal under a real row lock cannot be undone by the delayed activity", async () => {
  await withAuth(async ({ open, sql, namespace }) => {
    const server = await open();
    const { cookie } = await claim(server);
    const held = await holdSession(sql, namespace);
    let logout: Promise<Response> | undefined;
    let activity: Promise<Response> | undefined;
    try {
      logout = server.request("/auth/sign-out", {}, cookie);
      const logoutPid = await waitForBlock(sql, held.pid);
      activity = server.request("/auth/activity", {}, cookie);
      expect(await waitForBlock(sql, logoutPid)).toBeGreaterThan(0);
      held.release();
      await held.done;
      expect((await deadline(logout, "Logout did not complete")).status).toBe(200);
      expect((await deadline(activity, "Renewal did not complete")).status).toBe(401);
      expect((await server.request("/auth/session", undefined, cookie)).status).toBe(401);
    } finally {
      held.release();
      await held.done;
      await Promise.allSettled([logout, activity]);
    }
  });
});
