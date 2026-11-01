import { randomUUID } from "node:crypto";
import postgres from "postgres";
import type { AuthStore } from "@aircastle/core";
import { expect, test } from "vite-plus/test";
import { claim, issue, withAuth } from "./test-support/fixture.ts";
import type { AuthFixture, AuthServer } from "./test-support/fixture.ts";
import { deadline, waitForBlock } from "./test-support/postgres-wire.ts";

function transactionGate() {
  let armed: "session" | "replacement" | undefined;
  let entered!: () => void;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pause = async (effect: "session" | "replacement") => {
    if (armed !== effect) return;
    armed = undefined;
    entered();
    await released;
  };
  return {
    pause,
    arm: (effect: "session" | "replacement") => {
      armed = effect;
    },
    entered: () => deadline(ready, "Request never held a successful semantic write uncommitted"),
    release: () => release(),
    storage: (store: AuthStore): AuthStore => ({
      ...store,
      transaction: (work) =>
        store.transaction(async (tx) => {
          let effect = false;
          const value = await work({
            ...tx,
            insertSession: async (session) => {
              const saved = await tx.insertSession(session);
              if (armed === "session") effect = true;
              return saved;
            },
            replaceLink: async (link) => {
              await tx.replaceLink(link);
              if (armed === "replacement") effect = true;
            },
          });
          if (effect && armed) await pause(armed);
          return value;
        }),
    }),
  };
}

function labeledUrl(url: string, label: string) {
  const parsed = new URL(url);
  parsed.searchParams.set("application_name", label);
  return parsed.toString();
}

async function heldPid(fixture: AuthFixture, label: string) {
  const rows = await fixture.sql<{ pid: number }[]>`
    SELECT pid FROM pg_stat_activity
    WHERE application_name = ${label} AND state = 'idle in transaction'`;
  expect(rows).toHaveLength(1);
  const pid = rows[0]?.pid;
  if (!pid) throw new Error("Expected the held application's real transaction backend");
  return pid;
}

async function durable(fixture: AuthFixture) {
  const { sql, namespace } = fixture;
  const users = await sql<{ id: string; email: string }[]>`
    SELECT id, email FROM ${sql(namespace)}.auth_users ORDER BY email`;
  const sessions = await sql<{ id: string; user_id: string; token: string }[]>`
    SELECT id, user_id, token FROM ${sql(namespace)}.auth_sessions ORDER BY id`;
  return { users: [...users], sessions: [...sessions] };
}

async function pendingSignIn(server: AuthServer) {
  const previous = new Set(server.inbox.list().map(({ mail }) => mail.messageId));
  const response = await server.request("/auth/sign-in", { email: "alex@example.test" });
  expect(response.status).toBe(200);
  const mail = server.inbox.list().find(({ mail }) => !previous.has(mail.messageId))?.mail;
  expect(mail?.subject).toBe("Sign in to Aircastle");
  const link = mail?.text.match(/https?:\/\/[^\s<>]+/u)?.[0];
  const token = link && new URL(link).searchParams.get("token");
  expect(token).toBeTruthy();
  if (!token) throw new Error("Admitted sign-in must publish its actionable token");
  return { purpose: "sign-in" as const, token };
}

function cookie(response: Response) {
  const value = response.headers.get("set-cookie")?.split(";")[0];
  expect(value).toBeTruthy();
  if (!value) throw new Error("The sole successful confirmation must issue its browser cookie");
  return value;
}

test("contention observation control proves a held transaction, backend wait and independent committed reads", async () => {
  await withAuth(async (fixture) => {
    const { sql, namespace } = fixture;
    const label = `control_${randomUUID()}`;
    const holder = postgres(labeledUrl(fixture.url, label), { max: 1, onnotice: () => {} });
    const gate = transactionGate();
    let leading: Promise<unknown> | undefined;
    let following: Promise<unknown> | undefined;
    try {
      await sql`CREATE TABLE ${sql(namespace)}.contention_probe (id integer PRIMARY KEY)`;
      gate.arm("session");
      leading = holder.begin(async (tx) => {
        await tx`INSERT INTO ${tx(namespace)}.contention_probe VALUES (1)`;
        await gate.pause("session");
      });
      await deadline(Promise.race([gate.entered(), leading]), "Control never held its write");
      const pid = await heldPid(fixture, label);
      following =
        sql`INSERT INTO ${sql(namespace)}.contention_probe VALUES (1) ON CONFLICT DO NOTHING`.execute();
      expect(await waitForBlock(sql, pid)).toBeGreaterThan(0);
      expect(await sql`SELECT id FROM ${sql(namespace)}.contention_probe`).toHaveLength(0);
      gate.release();
      await deadline(Promise.all([leading, following]), "Control did not resume after release");
      expect([...(await sql`SELECT id FROM ${sql(namespace)}.contention_probe`)]).toEqual([
        { id: 1 },
      ]);
    } finally {
      gate.release();
      await Promise.allSettled([leading, following]);
      await holder.end();
    }
  });
}, 20_000);

test.each(["same-setup-token", "different-setup-identities", "same-sign-in-token"] as const)(
  "%s waits behind an uncommitted winner and leaves exactly one durable winning session",
  async (scenario) => {
    const gate = transactionGate();
    await withAuth(
      async (fixture) => {
        const label = `contention_${randomUUID()}`;
        const first = await fixture.open(undefined, labeledUrl(fixture.url, label));
        const second = await fixture.open();
        if (scenario === "same-sign-in-token") await claim(first);
        const a =
          scenario === "same-sign-in-token" ? await pendingSignIn(first) : await issue(first);
        const b =
          scenario === "different-setup-identities"
            ? await issue(second, "loser@example.test", "Loser")
            : a;
        const before = await durable(fixture);
        gate.arm("session");
        let winner: Promise<Response> | undefined;
        let loser: Promise<Response> | undefined;
        try {
          winner = first.request("/auth/confirm", { purpose: a.purpose, token: a.token });
          await deadline(
            Promise.race([
              gate.entered(),
              winner.then(() => {
                throw new Error("Winner completed before the semantic transaction gate");
              }),
            ]),
            "Winner never reached its uncommitted write",
          );
          const pid = await heldPid(fixture, label);
          loser = second.request("/auth/confirm", { purpose: b.purpose, token: b.token });
          expect(await waitForBlock(fixture.sql, pid)).toBeGreaterThan(0);
          expect(await durable(fixture)).toEqual(before);
          gate.release();
          const [won, lost] = await deadline(
            Promise.all([winner, loser]),
            "Contenders did not resume",
          );
          expect(won.status).toBe(200);
          expect(lost.status).toBe(scenario === "different-setup-identities" ? 409 : 400);
          expect(await lost.json()).toEqual(
            scenario === "different-setup-identities"
              ? { kind: "setup-complete" }
              : { kind: "invalid-link", next: "sign-in" },
          );
          expect(lost.headers.get("set-cookie")).toBeNull();
          const state = await durable(fixture);
          expect(state.users).toHaveLength(1);
          expect(state.users[0]?.email).toBe("alex@example.test");
          expect(state.sessions).toHaveLength(before.sessions.length + 1);
          expect(state.sessions.every((session) => session.user_id === state.users[0]?.id)).toBe(
            true,
          );
          expect(
            state.sessions.filter(
              (session) => !before.sessions.some(({ id }) => id === session.id),
            ),
          ).toHaveLength(1);
          expect((await second.request("/auth/session", undefined, cookie(won))).status).toBe(200);
          const replay = await second.request("/auth/confirm", {
            purpose: b.purpose,
            token: b.token,
          });
          expect(replay.status).toBe(scenario === "different-setup-identities" ? 409 : 400);
          expect(replay.headers.get("set-cookie")).toBeNull();
          expect(await durable(fixture)).toEqual(state);
        } finally {
          gate.release();
          await Promise.allSettled([winner, loser]);
        }
      },
      { storage: gate.storage },
    );
  },
  20_000,
);

test.each(["replacement-first", "redemption-first"] as const)(
  "old sign-in token and replacement serialize %s without revoking an established session",
  async (order) => {
    const gate = transactionGate();
    await withAuth(
      async (fixture) => {
        const label = `ordering_${randomUUID()}`;
        const first = await fixture.open(undefined, labeledUrl(fixture.url, label));
        const second = await fixture.open();
        await claim(first);
        const old = await pendingSignIn(first);
        const before = await durable(fixture);
        const replacement = (server: AuthServer) =>
          server.request("/auth/sign-in", { email: "alex@example.test" });
        const redemption = (server: AuthServer) => server.request("/auth/confirm", old);
        gate.arm(order === "replacement-first" ? "replacement" : "session");
        let leading: Promise<Response> | undefined;
        let following: Promise<Response> | undefined;
        try {
          leading = order === "replacement-first" ? replacement(first) : redemption(first);
          await deadline(
            Promise.race([
              gate.entered(),
              leading.then(() => {
                throw new Error("Leading operation completed before the semantic transaction gate");
              }),
            ]),
            "Leading operation never reached its uncommitted write",
          );
          const pid = await heldPid(fixture, label);
          following = order === "replacement-first" ? redemption(second) : replacement(second);
          expect(await waitForBlock(fixture.sql, pid)).toBeGreaterThan(0);
          expect(await durable(fixture)).toEqual(before);
          gate.release();
          const [lead, follow] = await deadline(
            Promise.all([leading, following]),
            "Ordered operations did not resume",
          );
          const issued = order === "replacement-first" ? lead : follow;
          const redeemed = order === "replacement-first" ? follow : lead;
          expect(issued.status).toBe(200);
          const after = await durable(fixture);
          expect(after.users).toEqual(before.users);
          if (order === "replacement-first") {
            expect(redeemed.status).toBe(400);
            expect(await redeemed.json()).toEqual({ kind: "superseded-link", next: "sign-in" });
            expect(redeemed.headers.get("set-cookie")).toBeNull();
            expect(after.sessions).toEqual(before.sessions);
          } else {
            expect(redeemed.status).toBe(200);
            expect(after.sessions).toHaveLength(before.sessions.length + 1);
            expect(
              (await second.request("/auth/session", undefined, cookie(redeemed))).status,
            ).toBe(200);
            expect(await durable(fixture)).toEqual(after);
          }
          const replay = await second.request("/auth/confirm", old);
          expect(replay.status).toBe(400);
          expect(replay.headers.get("set-cookie")).toBeNull();
          expect(await durable(fixture)).toEqual(after);
        } finally {
          gate.release();
          await Promise.allSettled([leading, following]);
        }
      },
      { storage: gate.storage },
    );
  },
  20_000,
);
