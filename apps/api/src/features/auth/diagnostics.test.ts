import pino from "pino";
import { AuthStorageError } from "@aircastle/core";
import type { AuthEvent } from "@aircastle/core";
import { expect, test } from "vite-plus/test";
import { createAuthEventLogger } from "./index.ts";
import { claim, limits, withAuth } from "./test-support/fixture.ts";

function applicationSink() {
  const lines: string[] = [];
  const logger = pino(
    { level: "info" },
    {
      write: (line) => {
        lines.push(line);
      },
    },
  );
  const records = () =>
    lines.map(
      (line) =>
        JSON.parse(line) as { auth?: AuthEvent; level: number; msg?: string; err?: unknown },
    );
  return {
    logger,
    lines,
    records,
    auth: () => records().flatMap((record) => (record.auth ? [record.auth] : [])),
  };
}

function loggedStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(loggedStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(loggedStrings);
  return [];
}

test("application sink control captures a real structured Pino record", () => {
  const sink = applicationSink();
  const event: AuthEvent = { kind: "delivery-failed" };
  sink.logger.info({ auth: event });
  expect(sink.auth()).toEqual([event]);
});

test("the application event emitter writes structured failed sign-in, blocked scope and delivery records to Pino", () => {
  const sink = applicationSink();
  const emit = createAuthEventLogger(sink.logger);
  const events: AuthEvent[] = [
    { kind: "sign-in-failed", reason: "unknown-identity" },
    { kind: "sign-in-failed", reason: "invalid-link" },
    { kind: "request-blocked", scopes: ["ip", "global"] },
    { kind: "delivery-failed" },
  ];
  for (const event of events) emit(event);
  for (const event of events) expect(sink.auth()).toContainEqual(event);
});

test("real HTTP failures emit unknown-identity, invalid-credential and capture diagnostics through the application sink", async () => {
  const sink = applicationSink();
  await withAuth(
    async ({ open, captureFailure }) => {
      const server = await open();
      const session = await claim(server);
      const unknown = await server.request("/auth/sign-in", { email: "unknown@example.test" });
      expect(unknown.status).toBe(200);
      expect(sink.auth()).toContainEqual({ kind: "sign-in-failed", reason: "unknown-identity" });
      const replay = await server.request("/auth/confirm", {
        purpose: "setup",
        token: session.link.token,
      });
      expect(replay.status).toBe(400);
      expect(sink.auth()).toContainEqual({ kind: "sign-in-failed", reason: "invalid-link" });
      captureFailure(true);
      const failed = await server.request("/auth/sign-in", { email: "alex@example.test" });
      expect(failed.status).toBe(503);
      expect(sink.auth()).toContainEqual({ kind: "delivery-failed" });
    },
    { logger: sink.logger },
  );
});

test.each(["email", "ip", "global"] as const)(
  "real %s admission rejection emits the triggered scope through Pino",
  async (scope) => {
    const sink = applicationSink();
    await withAuth(
      async ({ open, at }) => {
        const server = await open();
        await claim(server);
        at(3_600_000);
        expect((await server.request("/auth/sign-in", { email: "alex@example.test" })).status).toBe(
          200,
        );
        expect((await server.request("/auth/sign-in", { email: "alex@example.test" })).status).toBe(
          429,
        );
        expect(sink.auth()).toContainEqual({ kind: "request-blocked", scopes: [scope] });
      },
      {
        logger: sink.logger,
        limits: { ...limits, [scope]: { fiveMinutes: 1, oneHour: 1 } },
      },
    );
  },
);

test("real fixed-time failed-sign-in and blocked floods reach a positive bounded application sink", async () => {
  const sink = applicationSink();
  await withAuth(
    async ({ open, at }) => {
      const server = await open();
      await claim(server);
      at(3_600_000);
      for (let index = 0; index < 100; index++) {
        const response = await server.request("/auth/sign-in", {
          email: `missing${index}@example.test`,
        });
        expect(response.status).toBe(index < 10 ? 200 : 429);
      }
      expect(sink.auth()).toContainEqual({ kind: "sign-in-failed", reason: "unknown-identity" });
      expect(sink.auth()).toContainEqual({ kind: "request-blocked", scopes: ["ip"] });
      const emitted = sink.auth().length;
      expect(emitted).toBeGreaterThan(0);
      expect(emitted).toBeLessThan(100);
      for (let index = 100; index < 200; index++)
        expect(
          (await server.request("/auth/sign-in", { email: `missing${index}@example.test` })).status,
        ).toBe(429);
      expect(sink.auth()).toHaveLength(emitted);
    },
    { logger: sink.logger, limits: { ...limits, ip: { fiveMinutes: 10, oneHour: 30 } } },
  );
});

test("invalid-credential floods remain bounded in the positive application sink", async () => {
  const sink = applicationSink();
  await withAuth(
    async ({ open }) => {
      const server = await open();
      for (let index = 0; index < 100; index++)
        expect(
          (await server.request("/auth/confirm", { purpose: "sign-in", token: `unknown-${index}` }))
            .status,
        ).toBe(400);
      expect(sink.auth()).toContainEqual({ kind: "sign-in-failed", reason: "invalid-link" });
      const emitted = sink.auth().length;
      expect(emitted).toBeGreaterThan(0);
      expect(emitted).toBeLessThan(100);
      for (let index = 100; index < 200; index++)
        expect(
          (await server.request("/auth/confirm", { purpose: "sign-in", token: `unknown-${index}` }))
            .status,
        ).toBe(400);
      expect(sink.auth()).toHaveLength(emitted);
    },
    { logger: sink.logger },
  );
});

test("a positive application diagnostic sink excludes actual link, session, signing and email-body canaries", async () => {
  const sink = applicationSink();
  await withAuth(
    async ({ open, sql, namespace, captureFailure }) => {
      const server = await open();
      const session = await claim(server);
      const signingSecret = await server.storage.signingSecret();
      const stored = await sql<
        { token_digest: string }[]
      >`SELECT token_digest FROM ${sql(namespace)}.auth_sessions`;
      expect(stored).toHaveLength(1);
      const token = stored[0]?.token_digest;
      expect(token).toBeTruthy();
      const replay = await server.request(
        "/auth/confirm",
        { purpose: "setup", token: session.link.token },
        session.cookie,
      );
      expect(replay.status).toBe(400);
      expect(sink.auth()).toContainEqual({ kind: "sign-in-failed", reason: "invalid-link" });
      captureFailure(true);
      expect((await server.request("/auth/sign-in", { email: "alex@example.test" })).status).toBe(
        503,
      );
      expect(sink.auth()).toContainEqual({ kind: "delivery-failed" });
      await server.request(`/auth/${session.link.token}`, {}, session.cookie);
      const output = loggedStrings(sink.records());
      const cookieValue = session.cookie.slice(session.cookie.indexOf("=") + 1);
      for (const credential of [
        session.link.token,
        token,
        signingSecret,
        cookieValue,
        decodeURIComponent(cookieValue).split(".")[0],
        session.link.message.html,
        session.link.message.text,
      ]) {
        expect(credential).toBeTruthy();
        if (!credential) throw new Error("Credential exclusion requires real issued canaries");
        for (const field of output) expect(field).not.toContain(credential);
      }
    },
    { logger: sink.logger },
  );
});

test("a malformed inbox message id is not found and reports no storage outage", async () => {
  const sink = applicationSink();
  await withAuth(
    async ({ open, events }) => {
      const server = await open();
      const response = await server.request("/development-inbox/messages/%E0%A4%A/open", {});
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ kind: "not-found" });
      expect(events).toEqual([]);
      expect(sink.records().filter((record) => record.level >= 50)).toEqual([]);
    },
    { logger: sink.logger },
  );
});

test("a programming error in an auth request is logged as a summary and not as a storage outage", async () => {
  const sink = applicationSink();
  await withAuth(
    async ({ open, events }) => {
      const server = await open();
      for (const [path, body] of [
        ["/auth/state", undefined],
        ["/auth/setup", { name: "Alex", email: "alex@example.test" }],
      ] as const) {
        const response = await server.request(path, body);
        expect(response.status, path).toBe(500);
        expect(await response.json(), path).toEqual({ kind: "temporary-failure" });
        expect(response.headers.get("cache-control"), path).toContain("no-store");
      }
      expect(events.filter((event) => event.kind === "storage-unavailable")).toEqual([]);
      const errors = sink.records().filter((record) => record.msg === "Unexpected auth error");
      expect(errors).toHaveLength(2);
      for (const error of errors)
        expect(error.err).toMatchObject({ type: "ErrorSummary", message: "TypeError" });
      for (const field of loggedStrings(sink.records())) expect(field).not.toContain("bug-canary");
      expect(server.inbox.list()).toEqual([]);
    },
    {
      logger: sink.logger,
      storage: (store) => ({
        ...store,
        transaction: async () => {
          throw new TypeError("bug-canary");
        },
      }),
    },
  );
});

test("a storage outage event carries the driver code and never the driver message", async () => {
  const sink = applicationSink();
  await withAuth(
    async ({ open, events }) => {
      const server = await open();
      const response = await server.request("/auth/state");
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ kind: "temporary-failure" });
      expect(events).toEqual([{ kind: "storage-unavailable", code: "57P01" }]);
      expect(sink.auth()).toEqual([{ kind: "storage-unavailable", code: "57P01" }]);
      for (const field of loggedStrings(sink.records()))
        expect(field).not.toContain("outage-canary");
    },
    {
      logger: sink.logger,
      storage: (store) => ({
        ...store,
        transaction: async () => {
          throw new AuthStorageError("unavailable", {
            cause: new Error("outage-canary"),
            code: "57P01",
          });
        },
      }),
    },
  );
});

test("a bug while resolving an unknown commit is logged as a summary and not retried as an outage", async () => {
  const sink = applicationSink();
  let lookups = 0;
  await withAuth(
    async ({ open, events, storageFailure }) => {
      const server = await open();
      storageFailure("ack");
      const response = await server.request("/auth/setup", {
        name: "Alex",
        email: "alex@example.test",
      });
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ kind: "temporary-failure" });
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      expect(lookups).toBe(1);
      expect(events).toEqual([{ kind: "storage-unavailable" }]);
      const errors = sink.records().filter((record) => record.msg === "Unexpected auth error");
      expect(errors).toHaveLength(1);
      expect(errors[0]?.err).toMatchObject({ type: "ErrorSummary", message: "TypeError" });
      for (const field of loggedStrings(sink.records())) expect(field).not.toContain("bug-canary");
      expect(server.inbox.list()).toEqual([]);
    },
    {
      logger: sink.logger,
      storage: (store) => ({
        ...store,
        resolveIssuance: async () => {
          lookups += 1;
          throw new TypeError("bug-canary");
        },
      }),
    },
  );
}, 30_000);

test("a bug in background issuance reconciliation drops the capture and logs a summary once", async () => {
  const sink = applicationSink();
  let lookups = 0;
  await withAuth(
    async ({ open, events, storageFailure }) => {
      const server = await open();
      storageFailure("ack");
      const response = await server.request("/auth/setup", {
        name: "Alex",
        email: "alex@example.test",
      });
      expect(response.status).toBe(503);
      const deadline = Date.now() + 5_000;
      while (lookups < 2 && Date.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 50));
      expect(lookups).toBe(2);
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      expect(lookups).toBe(2);
      expect(events).toEqual([{ kind: "storage-unavailable" }]);
      const errors = sink.records().filter((record) => record.msg === "Unexpected auth error");
      expect(errors).toHaveLength(1);
      expect(errors[0]?.err).toMatchObject({ type: "ErrorSummary", message: "TypeError" });
      for (const field of loggedStrings(sink.records())) expect(field).not.toContain("bug-canary");
      expect(server.inbox.list()).toEqual([]);
    },
    {
      logger: sink.logger,
      storage: (store) => ({
        ...store,
        resolveIssuance: async () => {
          lookups += 1;
          if (lookups === 1) throw new AuthStorageError("unavailable");
          throw new TypeError("bug-canary");
        },
      }),
    },
  );
}, 30_000);
