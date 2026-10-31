import pino from "pino";
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
  const records = () => lines.map((line) => JSON.parse(line) as { auth?: AuthEvent });
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
        { token: string }[]
      >`SELECT token FROM ${sql(namespace)}.auth_sessions`;
      expect(stored).toHaveLength(1);
      const token = stored[0]?.token;
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
