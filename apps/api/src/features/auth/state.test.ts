import { expect, test } from "vite-plus/test";
import { claim, start, withAuth } from "./test-support/fixture.ts";
import { deadline } from "./test-support/postgres-wire.ts";
import { holdSession } from "./test-support/session-lock.ts";

test("state returns the signed-in projection without waiting for the session row lock", async () => {
  await withAuth(async ({ open, sql, namespace }) => {
    const server = await open();
    const { cookie } = await claim(server);
    const held = await holdSession(sql, namespace);
    try {
      const response = await deadline(
        server.request("/auth/state", undefined, cookie),
        "State waited for the held session row",
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        kind: "ok",
        value: {
          kind: "authenticated",
          session: {
            user: {
              id: expect.any(String),
              name: "Alex",
              email: "alex@example.test",
              authority: "super_user",
            },
            expiresAt: start + 1_209_600_000,
          },
        },
      });
      expect(response.headers.get("set-cookie")).toBeNull();
    } finally {
      held.release();
      await held.done;
    }
  });
});

test("state reads setup without waiting for an in-flight setup claim", async () => {
  await withAuth(async ({ open, sql, namespace }) => {
    const server = await open();
    let release: () => void = () => {};
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked: () => void = () => {};
    const lockTaken = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const claimLock = sql.begin(async (tx) => {
      await tx`SELECT setup_user_id FROM ${tx(namespace)}.auth_settings WHERE singleton = 1 FOR UPDATE`;
      locked();
      await released;
    });
    try {
      await lockTaken;
      const response = await deadline(
        server.request("/auth/state"),
        "State waited for the held setup row",
      );
      expect(await response.json()).toEqual({ kind: "ok", value: { kind: "setup-required" } });
    } finally {
      release();
      await claimLock;
    }
  });
});

test("entry returns the renewed session projection with its destination", async () => {
  await withAuth(async ({ open, at }) => {
    const server = await open();
    const { cookie } = await claim(server);
    at(5_000);
    const response = await server.request("/auth/entry", { kind: "resolve" }, cookie);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      kind: "ok",
      value: {
        destination: { kind: "create-workspace" },
        session: {
          user: {
            id: expect.any(String),
            name: "Alex",
            email: "alex@example.test",
            authority: "super_user",
          },
          expiresAt: start + 5_000 + 1_209_600_000,
        },
      },
    });
  });
});
