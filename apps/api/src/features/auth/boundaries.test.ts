import { describe, expect, test } from "vite-plus/test";
import pino from "pino";
import type { AuthLimits } from "@aircastle/core";
import { createApp } from "../../app.ts";
import { createLocalAuth } from "./index.ts";
import { browserOrigin, claim, issue, start, withAuth } from "./test-support/fixture.ts";

const defaults: AuthLimits = {
  email: { fiveMinutes: 5, oneHour: 20 },
  ip: { fiveMinutes: 10, oneHour: 30 },
  global: { fiveMinutes: 30, oneHour: 100 },
};
const generous: AuthLimits = {
  email: { fiveMinutes: 100, oneHour: 100 },
  ip: { fiveMinutes: 100, oneHour: 100 },
  global: { fiveMinutes: 100, oneHour: 100 },
};
const setup = { name: "Alex", email: "alex@example.test" };
const headers = {
  host: "localhost:43121",
  origin: browserOrigin,
  "content-type": "application/json",
};

describe("local auth HTTP boundaries", () => {
  test("disabled auth exposes configuration state but no inbox or account mutations", async () => {
    const auth = await createLocalAuth({ config: { mode: "disabled" } });
    const app = createApp({ logger: pino({ level: "silent" }), auth });
    try {
      const state = await app.request(`${browserOrigin}/api/auth/state`);
      expect(state.status).toBe(200);
      expect(await state.json()).toEqual({ kind: "ok", value: { kind: "disabled" } });
      for (const path of [
        "/auth/setup",
        "/auth/sign-in",
        "/auth/confirm",
        "/auth/activity",
        "/auth/entry",
      ]) {
        const response = await app.request(`${browserOrigin}/api${path}`, {
          method: "POST",
          headers,
          body: JSON.stringify(setup),
        });
        expect(response.status, path).toBe(404);
        expect(response.headers.get("set-cookie")).toBeNull();
      }
      const inbox = await app.request(`${browserOrigin}/api/development-inbox/messages`);
      expect(inbox.status).toBe(404);
      expect(inbox.headers.get("cache-control")).toContain("no-store");
    } finally {
      await auth.close();
    }
  });

  test.each([
    { origin: "https://evil.test" },
    { origin: "null" },
    { host: "evil.test" },
    { host: "localhost.evil.test:43121" },
    { host: "localhost:43122" },
  ])("rejects disallowed request authority %j before admission", async (forged) => {
    await withAuth(
      async (fixture) => {
        const server = await fixture.open();
        for (let index = 0; index < 3; index++)
          expect((await server.request("/auth/setup", setup, undefined, forged)).status).toBe(403);
        expect(server.inbox.list()).toEqual([]);
        expect((await server.request("/auth/setup", setup)).status).toBe(200);
      },
      { limits: { ...generous, ip: { fiveMinutes: 1, oneHour: 1 } } },
    );
  });

  test("an absent Origin cannot be replaced by forwarding headers", async () => {
    await withAuth(async ({ open }) => {
      const server = await open();
      const response = await server.app.request(
        `${browserOrigin}/api/auth/setup`,
        {
          method: "POST",
          headers: {
            host: "localhost:43121",
            "content-type": "application/json",
            "x-forwarded-host": "localhost:43121",
          },
          body: JSON.stringify(setup),
        },
        { peerAddress: "127.0.0.1" },
      );
      expect(response.status).toBe(403);
      expect(server.inbox.list()).toEqual([]);
    });
  });

  test("a missing socket peer cannot be replaced by X-Forwarded-For", async () => {
    await withAuth(async ({ open }) => {
      const server = await open();
      const response = await server.app.request(
        `${browserOrigin}/api/auth/setup`,
        {
          method: "POST",
          headers: { ...headers, "x-forwarded-for": "127.0.0.1" },
          body: JSON.stringify(setup),
        },
        {},
      );
      expect(response.status).toBe(403);
      expect(server.inbox.list()).toEqual([]);
    });
  });

  test("forwarded addresses cannot evade the real peer budget or choose link origins", async () => {
    await withAuth(
      async ({ open, events }) => {
        const server = await open();
        for (let index = 0; index < 3; index++) {
          const response = await server.request(
            "/auth/setup",
            { ...setup, email: `user${index}@example.test` },
            undefined,
            {
              "x-forwarded-for": `203.0.113.${index + 1}`,
              "x-real-ip": `203.0.113.${index + 1}`,
              forwarded: `for=203.0.113.${index + 1};host=evil.test;proto=https`,
              "x-forwarded-host": "evil.test",
              "x-forwarded-proto": "https",
            },
          );
          expect(response.status).toBe(index < 2 ? 200 : 429);
        }
        expect(server.inbox.list()).toHaveLength(2);
        for (const { mail } of server.inbox.list()) {
          expect(mail.text).toContain(`${browserOrigin}/setup?token=`);
          expect(mail.text).not.toContain("evil.test");
        }
        expect(events).toContainEqual({ kind: "request-blocked", scopes: ["ip"] });
      },
      { limits: { ...generous, ip: { fiveMinutes: 2, oneHour: 2 } } },
    );
  });

  test("oversized requests without Content-Length are rejected before spending quota", async () => {
    await withAuth(
      async ({ open }) => {
        const server = await open();
        const response = await server.app.request(
          `${browserOrigin}/api/auth/setup`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ ...setup, name: "a".repeat(2_048) }),
          },
          { peerAddress: "127.0.0.1" },
        );
        expect(response.status).toBe(413);
        expect(server.inbox.list()).toEqual([]);
        expect((await server.request("/auth/setup", setup)).status).toBe(200);
      },
      { limits: { ...generous, ip: { fiveMinutes: 1, oneHour: 1 } }, maxRequestBytes: 1_024 },
    );
  });

  test.each([
    "{",
    "null",
    "[]",
    JSON.stringify({ email: "bad", name: "Alex" }),
    JSON.stringify({ ...setup, role: "super_user" }),
  ])("malformed input %s consumes outer protection without producing mail", async (body) => {
    await withAuth(
      async ({ open }) => {
        const server = await open();
        const malformed = await server.app.request(
          `${browserOrigin}/api/auth/setup`,
          {
            method: "POST",
            headers,
            body,
          },
          { peerAddress: "127.0.0.1" },
        );
        expect(malformed.status).toBe(400);
        expect((await server.request("/auth/setup", setup)).status).toBe(429);
        expect(server.inbox.list()).toEqual([]);
        expect(
          (await server.request("/auth/setup", setup, undefined, {}, "127.0.0.2")).status,
        ).toBe(200);
      },
      {
        limits: {
          ...generous,
          email: { fiveMinutes: 1, oneHour: 1 },
          ip: { fiveMinutes: 1, oneHour: 1 },
        },
      },
    );
  });

  test("recipient rejection spends outer slots and does not replace the existing link", async () => {
    await withAuth(
      async ({ open }) => {
        const server = await open();
        const original = await issue(server);
        const rejected = await server.request("/auth/setup", setup);
        expect(rejected.status).toBe(429);
        expect(await rejected.json()).toEqual({ kind: "throttled", retryAt: start + 300_000 });
        expect(rejected.headers.get("retry-after")).toBe("300");
        const other = await server.request("/auth/setup", {
          ...setup,
          email: "other@example.test",
        });
        expect(other.status).toBe(429);
        expect(server.inbox.list()).toEqual([{ mail: original.message, read: false }]);
        const confirmation = await server.request("/auth/confirm", {
          purpose: "setup",
          token: original.token,
        });
        expect(confirmation.status).toBe(200);
      },
      {
        limits: {
          ...generous,
          email: { fiveMinutes: 1, oneHour: 10 },
          ip: { fiveMinutes: 2, oneHour: 10 },
        },
      },
    );
  });

  test("failed capture spends its admitted slot and records a delivery failure", async () => {
    await withAuth(
      async ({ open, captureFailure, events }) => {
        const server = await open();
        captureFailure(true);
        const failure = await server.request("/auth/setup", setup);
        expect(failure.status).toBe(503);
        expect(await failure.json()).toEqual({ kind: "temporary-failure" });
        expect(events).toContainEqual({ kind: "delivery-failed" });
        captureFailure(false);
        expect((await server.request("/auth/setup", setup)).status).toBe(429);
        expect(server.inbox.list()).toEqual([]);
      },
      { limits: { ...generous, email: { fiveMinutes: 1, oneHour: 1 } } },
    );
  });

  test("unknown identities spend the same recipient budget without producing email", async () => {
    await withAuth(
      async ({ open, at }) => {
        const server = await open();
        await claim(server);
        at(300_000);
        for (const email of ["missing@example.test", "alex@example.test"]) {
          const first = await server.request("/auth/sign-in", { email });
          expect(first.status).toBe(200);
          expect(await first.json()).toEqual({
            kind: "ok",
            value: { confirmation: "sign-in-inbox" },
          });
          expect(
            (await server.request("/auth/sign-in", { email: ` ${email.toUpperCase()} ` })).status,
          ).toBe(429);
        }
        expect(
          server.inbox.list().filter(({ mail }) => mail.to.includes("missing@example.test")),
        ).toEqual([]);
      },
      { limits: { ...generous, email: { fiveMinutes: 1, oneHour: 10 } } },
    );
  });

  test("state and inbox polling do not spend link-request allowances", async () => {
    await withAuth(
      async ({ open }) => {
        const server = await open();
        for (let index = 0; index < 15; index++) {
          expect((await server.request("/auth/state")).status).toBe(200);
          const inbox = await server.request("/development-inbox/messages");
          expect(inbox.status).toBe(200);
          expect(inbox.headers.get("cache-control")).toContain("no-store");
        }
        expect((await server.request("/auth/setup", setup)).status).toBe(200);
      },
      {
        limits: {
          ...generous,
          ip: { fiveMinutes: 1, oneHour: 1 },
          global: { fiveMinutes: 1, oneHour: 1 },
        },
      },
    );
  });

  test("actual app logs and auth events stay bounded during a fixed-time flood", async () => {
    const logs: string[] = [];
    const logger = pino(
      { level: "info" },
      {
        write: (chunk: string) => {
          logs.push(chunk);
        },
      },
    );
    await withAuth(
      async ({ open, events }) => {
        const server = await open();
        for (let index = 0; index < 100; index++)
          await server.request("/auth/setup", {
            ...setup,
            email: `recipient${index}@example.test`,
          });
        expect(events.some((event) => event.kind === "request-blocked")).toBe(true);
        expect(events.length).toBeGreaterThan(0);
        const firstEvents = events.length;
        const firstLogs = logs.length;
        for (let index = 100; index < 200; index++)
          expect(
            (
              await server.request("/auth/setup", {
                ...setup,
                email: `recipient${index}@example.test`,
              })
            ).status,
          ).toBe(429);
        expect(events.length).toBe(firstEvents);
        expect(logs.length).toBe(firstLogs);
      },
      { limits: defaults, logger },
    );
  });

  test("request paths, errors and projections never leak actual credential canaries", async () => {
    const logs: string[] = [];
    const logger = pino(
      { level: "info" },
      {
        write: (chunk: string) => {
          logs.push(chunk);
        },
      },
    );
    await withAuth(
      async ({ open, events }) => {
        const server = await open();
        const session = await claim(server);
        const secret = await server.storage.signingSecret();
        const cookieSecret = session.cookie.slice(session.cookie.indexOf("=") + 1);
        const body = await (
          await server.request("/auth/session", undefined, session.cookie)
        ).text();
        await server.request(`/auth/${session.link.token}`, {}, session.cookie);
        await server.request("/auth/confirm", { purpose: "setup", token: session.link.token });
        const output = JSON.stringify({ logs, events, body });
        for (const credential of [
          session.link.token,
          secret,
          cookieSecret,
          session.link.message.html,
        ]) {
          expect(credential).toBeTruthy();
          expect(output).not.toContain(credential);
        }
      },
      { logger },
    );
  });
});
