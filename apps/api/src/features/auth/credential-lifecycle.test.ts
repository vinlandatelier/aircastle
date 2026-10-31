import { randomUUID } from "node:crypto";
import type { ProtectedDestination } from "@aircastle/core";
import { expect, test } from "vite-plus/test";
import { browserOrigin, claim, withAuth } from "./test-support/fixture.ts";
import type { AuthFixture, AuthServer } from "./test-support/fixture.ts";

async function credentialCounts(sql: AuthFixture["sql"], namespace: string) {
  const [counts] = await sql<{ users: number; sessions: number }[]>`
    SELECT
      (SELECT count(*)::integer FROM ${sql(namespace)}.auth_users) AS users,
      (SELECT count(*)::integer FROM ${sql(namespace)}.auth_sessions) AS sessions`;
  if (!counts) throw new Error("Independent durable credential counts must return a row");
  return counts;
}

async function waitForContenders(sql: AuthFixture["sql"], blocker: number) {
  const until = Date.now() + 5_000;
  while (Date.now() < until) {
    const [waiting] = await sql<{ contenders: number }[]>`
      WITH RECURSIVE waiters AS (
        SELECT pid FROM pg_stat_activity WHERE ${blocker} = ANY(pg_blocking_pids(pid))
        UNION
        SELECT activity.pid FROM pg_stat_activity AS activity
        JOIN waiters ON waiters.pid = ANY(pg_blocking_pids(activity.pid))
      ) SELECT count(DISTINCT pid)::integer AS contenders FROM waiters`;
    if (waiting?.contenders === 2) return waiting.contenders;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(
    "Both sign-in confirmations must demonstrably wait before the session gate opens",
  );
}

async function pendingLink(
  server: AuthServer,
  purpose: "setup" | "sign-in",
  returnTo?: ProtectedDestination,
) {
  const before = new Set(server.inbox.list().map(({ mail }) => mail.messageId));
  const issued = await server.request(`/auth/${purpose}`, {
    email: "alex@example.test",
    ...(purpose === "setup" ? { name: "Alex" } : {}),
    ...(returnTo === undefined ? {} : { returnTo }),
  });
  expect(issued.status).toBe(200);
  expect(await issued.json()).toEqual({
    kind: "ok",
    value: { confirmation: purpose === "setup" ? "setup-inbox" : "sign-in-inbox" },
  });
  expect(issued.headers.get("set-cookie")).toBeNull();
  const messages = server.inbox.list().filter(({ mail }) => !before.has(mail.messageId));
  expect(messages).toHaveLength(1);
  const mail = messages[0]?.mail;
  expect(mail?.to).toEqual(["alex@example.test"]);
  expect(mail?.subject).toBe(
    purpose === "setup" ? "Create your Aircastle account" : "Sign in to Aircastle",
  );
  const link = mail?.text.match(/https?:\/\/[^\s<>]+/u)?.[0];
  if (!link) throw new Error("Successful issuance must capture an actionable link");
  const url = new URL(link);
  expect(url.origin).toBe(browserOrigin);
  expect(url.pathname).toBe(`/${purpose}`);
  const token = url.searchParams.get("token");
  if (!token) throw new Error("Captured link must contain its confirmation token");
  return { purpose, token };
}

function confirmationCookie(response: Response) {
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  expect(cookie).toBeTruthy();
  if (!cookie) throw new Error("Successful confirmation must establish a browser session");
  return cookie;
}

test("a pending sign-in link cannot authenticate or recreate its deleted user", async () => {
  await withAuth(async ({ open, sql, namespace }) => {
    const server = await open();
    await claim(server);
    const link = await pendingLink(server, "sign-in");
    const preview = await server.request("/auth/confirm/preview", link);
    expect(preview.status).toBe(200);
    expect(await preview.json()).toEqual({
      kind: "ok",
      value: { email: "alex@example.test", purpose: "sign-in" },
    });
    const user = await server.storage.transaction((tx) => tx.userByEmail("alex@example.test"));
    if (!user) throw new Error("Setup must persist the user before deletion");
    await sql`DELETE FROM ${sql(namespace)}.auth_users WHERE id = ${user.id}`;
    const counts = await credentialCounts(sql, namespace);
    expect(counts.users).toBe(0);
    const sessions = await sql`SELECT id FROM ${sql(namespace)}.auth_sessions ORDER BY id`;
    const confirmed = await server.request("/auth/confirm", link);
    expect(confirmed.status).toBe(400);
    expect(await confirmed.json()).toEqual({ kind: "invalid-link", next: "sign-in" });
    expect(confirmed.headers.get("set-cookie")).toBeNull();
    expect(await credentialCounts(sql, namespace)).toEqual(counts);
    expect(await server.storage.transaction((tx) => tx.userById(user.id))).toBeNull();
    expect(
      await server.storage.transaction((tx) => tx.userByEmail("alex@example.test")),
    ).toBeNull();
    expect(await sql`SELECT id FROM ${sql(namespace)}.auth_sessions ORDER BY id`).toEqual(sessions);
    expect((await server.request("/auth/session")).status).toBe(401);
    expect(await (await server.request("/auth/state")).json()).toEqual({
      kind: "ok",
      value: { kind: "signed-out" },
    });
  });
});

test("a sign-in token rejected as setup remains usable for sign-in", async () => {
  await withAuth(async ({ open, sql, namespace }) => {
    const server = await open();
    await claim(server);
    const user = await server.storage.transaction((tx) => tx.userByEmail("alex@example.test"));
    if (!user) throw new Error("Setup must persist the user before issuing a sign-in link");
    const link = await pendingLink(server, "sign-in");
    const counts = await credentialCounts(sql, namespace);
    expect(counts).toEqual({ users: 1, sessions: 1 });
    const sessions = await sql`SELECT id FROM ${sql(namespace)}.auth_sessions ORDER BY id`;
    const wrong = await server.request("/auth/confirm", { ...link, purpose: "setup" });
    expect(wrong.status).toBe(400);
    expect(await wrong.json()).toEqual({ kind: "invalid-link", next: "sign-in" });
    expect(wrong.headers.get("set-cookie")).toBeNull();
    expect(await credentialCounts(sql, namespace)).toEqual(counts);
    expect(await sql`SELECT id FROM ${sql(namespace)}.auth_sessions ORDER BY id`).toEqual(sessions);
    const preview = await server.request("/auth/confirm/preview", link);
    expect(preview.status).toBe(200);
    expect(await preview.json()).toEqual({
      kind: "ok",
      value: { email: "alex@example.test", purpose: "sign-in" },
    });
    const confirmed = await server.request("/auth/confirm", link);
    expect(confirmed.status).toBe(200);
    expect(await confirmed.json()).toEqual({
      kind: "ok",
      value: { destination: { kind: "dashboard" } },
    });
    const session = await server.request("/auth/session", undefined, confirmationCookie(confirmed));
    expect(session.status).toBe(200);
    expect(await session.json()).toMatchObject({
      kind: "ok",
      value: {
        user: {
          id: user.id,
          name: "Alex",
          email: "alex@example.test",
          authority: "super_user",
        },
      },
    });
  });
});

for (const elapsed of [299_999, 300_000]) {
  test(`sign-in token expires strictly 300 seconds after its issuance at ${elapsed} milliseconds`, async () => {
    await withAuth(async ({ open, at, sql, namespace }) => {
      const server = await open();
      await claim(server);
      at(10_000);
      const link = await pendingLink(server, "sign-in");
      const counts = await credentialCounts(sql, namespace);
      expect(counts).toEqual({ users: 1, sessions: 1 });
      at(10_000 + elapsed);
      const confirmed = await server.request("/auth/confirm", link);
      expect(confirmed.status).toBe(elapsed < 300_000 ? 200 : 400);
      if (elapsed < 300_000) {
        expect(await confirmed.json()).toEqual({
          kind: "ok",
          value: { destination: { kind: "dashboard" } },
        });
        const cookie = confirmationCookie(confirmed);
        expect((await server.request("/auth/session", undefined, cookie)).status).toBe(200);
        expect(await credentialCounts(sql, namespace)).toEqual({ users: 1, sessions: 2 });
      } else {
        expect(await confirmed.json()).toEqual({ kind: "invalid-link", next: "sign-in" });
        expect(confirmed.headers.get("set-cookie")).toBeNull();
        expect(await credentialCounts(sql, namespace)).toEqual(counts);
      }
    });
  });
}

test("replaying a consumed sign-in token cannot create another user, session or cookie", async () => {
  await withAuth(async ({ open, sql, namespace }) => {
    const server = await open();
    await claim(server);
    const link = await pendingLink(server, "sign-in");
    const confirmed = await server.request("/auth/confirm", link);
    expect(confirmed.status).toBe(200);
    const cookie = confirmationCookie(confirmed);
    expect((await server.request("/auth/session", undefined, cookie)).status).toBe(200);
    const counts = await credentialCounts(sql, namespace);
    expect(counts).toEqual({ users: 1, sessions: 2 });
    const reopened = await open();
    const replay = await reopened.request("/auth/confirm", link);
    expect(replay.status).toBe(400);
    expect(await replay.json()).toEqual({ kind: "invalid-link", next: "sign-in" });
    expect(replay.headers.get("set-cookie")).toBeNull();
    expect(await credentialCounts(sql, namespace)).toEqual(counts);
    expect((await reopened.request("/auth/session", undefined, cookie)).status).toBe(200);
  });
});

test("concurrent redemption of one sign-in token commits exactly one new session", async () => {
  await withAuth(async ({ open, sql, namespace }) => {
    const first = await open();
    await claim(first);
    const link = await pendingLink(first, "sign-in");
    const second = await open();
    expect(await credentialCounts(sql, namespace)).toEqual({ users: 1, sessions: 1 });
    const confirmations: Promise<Response>[] = [];
    let responses: Response[];
    try {
      await sql.begin(async (tx) => {
        await tx`LOCK TABLE ${tx(namespace)}.auth_sessions IN SHARE MODE`;
        const [backend] = await tx<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
        if (!backend) throw new Error("Session gate must have a Postgres backend identity");
        confirmations.push(
          ...[first, second].map((server) => server.request("/auth/confirm", link)),
        );
        expect(await waitForContenders(sql, backend.pid)).toBe(2);
        expect(await credentialCounts(sql, namespace)).toEqual({ users: 1, sessions: 1 });
      });
      responses = await Promise.all(confirmations);
    } finally {
      await Promise.allSettled(confirmations);
    }
    expect(responses.map((response) => response.status).sort((a, b) => a - b)).toEqual([200, 400]);
    for (const response of responses) {
      if (response.status === 200) {
        expect(await response.json()).toEqual({
          kind: "ok",
          value: { destination: { kind: "dashboard" } },
        });
        const cookie = confirmationCookie(response);
        expect((await first.request("/auth/session", undefined, cookie)).status).toBe(200);
      } else {
        expect(await response.json()).toEqual({ kind: "invalid-link", next: "sign-in" });
        expect(response.headers.get("set-cookie")).toBeNull();
      }
    }
    expect(await credentialCounts(sql, namespace)).toEqual({ users: 1, sessions: 2 });
  });
}, 15_000);

test("replacement invalidates the old sign-in token, expiry takes precedence, and the newest stays usable", async () => {
  await withAuth(async ({ open, at, sql, namespace }) => {
    const server = await open();
    await claim(server);
    at(10_000);
    const old = await pendingLink(server, "sign-in");
    at(11_000);
    const latest = await pendingLink(server, "sign-in");
    expect(latest.token).not.toBe(old.token);
    const counts = await credentialCounts(sql, namespace);
    expect(counts).toEqual({ users: 1, sessions: 1 });
    const superseded = await server.request("/auth/confirm", old);
    expect(superseded.status).toBe(400);
    expect(await superseded.json()).toEqual({ kind: "superseded-link", next: "sign-in" });
    expect(superseded.headers.get("set-cookie")).toBeNull();
    expect(await credentialCounts(sql, namespace)).toEqual(counts);
    at(310_000);
    const expired = await server.request("/auth/confirm", old);
    expect(expired.status).toBe(400);
    expect(await expired.json()).toEqual({ kind: "invalid-link", next: "sign-in" });
    expect(expired.headers.get("set-cookie")).toBeNull();
    expect(await credentialCounts(sql, namespace)).toEqual(counts);
    const confirmed = await server.request("/auth/confirm", latest);
    expect(confirmed.status).toBe(200);
    expect(await confirmed.json()).toEqual({
      kind: "ok",
      value: { destination: { kind: "dashboard" } },
    });
    const cookie = confirmationCookie(confirmed);
    expect((await server.request("/auth/session", undefined, cookie)).status).toBe(200);
    expect(await credentialCounts(sql, namespace)).toEqual({ users: 1, sessions: 2 });
  });
});

test("altering an actual issued cookie rejects session access without revoking the original", async () => {
  await withAuth(async ({ open, sql, namespace }) => {
    const server = await open();
    const { cookie } = await claim(server);
    expect((await server.request("/auth/session", undefined, cookie)).status).toBe(200);
    const tampered = cookie.replace(/=(.)/u, (_match, first: string) =>
      first === "a" ? "=b" : "=a",
    );
    expect(tampered).not.toBe(cookie);
    const counts = await credentialCounts(sql, namespace);
    expect(counts).toEqual({ users: 1, sessions: 1 });
    for (const [path, body] of [
      ["/auth/session", undefined],
      ["/auth/activity", {}],
      ["/auth/entry", { kind: "resolve" }],
    ] as const) {
      const response = await server.request(path, body, tampered);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ kind: "unauthenticated" });
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(await credentialCounts(sql, namespace)).toEqual(counts);
    }
    expect((await server.request("/auth/session", undefined, cookie)).status).toBe(200);
  });
});

test("setup restores its link-carried authorized destination and skips automatic onboarding", async () => {
  await withAuth(async ({ open }) => {
    const server = await open();
    const destination = { kind: "workspaces" } as const;
    const link = await pendingLink(server, "setup", destination);
    const reopened = await open();
    const confirmed = await reopened.request("/auth/confirm", link);
    expect(confirmed.status).toBe(200);
    expect(await confirmed.json()).toEqual({ kind: "ok", value: { destination } });
    const cookie = confirmationCookie(confirmed);
    const observer = await open();
    const user = await observer.storage.transaction((tx) => tx.userByEmail("alex@example.test"));
    if (!user) throw new Error("Confirmation must persist its user before entry resolution");
    expect(await observer.storage.transaction((tx) => tx.entry(user.id))).toMatchObject({
      onboardingOffered: true,
    });
    const restored = await observer.request("/auth/entry", { kind: "resolve" }, cookie);
    expect(restored.status).toBe(200);
    expect(await restored.json()).toEqual({ kind: "ok", value: { destination } });
    const session = await reopened.request("/auth/session", undefined, cookie);
    expect(session.status).toBe(200);
    const entry = await reopened.request("/auth/entry", { kind: "resolve" }, cookie);
    expect(entry.status).toBe(200);
    expect(await entry.json()).toEqual({ kind: "ok", value: { destination } });
  });
});

for (const revoked of [false, true]) {
  test(`sign-in link destination ${revoked ? "falls back after membership is revoked following preview" : "is restored while membership remains authorized"}`, async () => {
    await withAuth(async ({ open, content, sql, namespace }) => {
      const project = await content.provision({
        verifier: "credential-lifecycle-digest",
        permissions: ["content:read"],
        key: "reuse",
        workspaceName: "Development workspace",
        projectName: "Development project",
      });
      const server = await open();
      const { cookie } = await claim(server);
      const user = await server.storage.transaction((tx) => tx.userByEmail("alex@example.test"));
      if (!user) throw new Error("Setup must persist a user before granting fixture membership");
      await sql`INSERT INTO ${sql(namespace)}.auth_workspace_access (user_id, workspace_id) VALUES (${user.id}, ${project.workspace})`;
      const destination = {
        kind: "project-page",
        workspaceId: project.workspace,
        projectId: project.project,
        page: "collections",
      } as const;
      const before = await server.request("/auth/entry", { kind: "visit", destination }, cookie);
      expect(before.status).toBe(200);
      expect(await before.json()).toEqual({ kind: "ok", value: { destination } });
      const link = await pendingLink(server, "sign-in", destination);
      const preview = await server.request("/auth/confirm/preview", link);
      expect(preview.status).toBe(200);
      expect(await preview.json()).toEqual({
        kind: "ok",
        value: { email: "alex@example.test", purpose: "sign-in" },
      });
      if (revoked)
        await sql`DELETE FROM ${sql(namespace)}.auth_workspace_access WHERE user_id = ${user.id} AND workspace_id = ${project.workspace}`;
      const reopened = await open();
      const confirmed = await reopened.request("/auth/confirm", link);
      expect(confirmed.status).toBe(200);
      expect(await confirmed.json()).toEqual({
        kind: "ok",
        value: { destination: revoked ? { kind: "dashboard" } : destination },
      });
      const signedIn = confirmationCookie(confirmed);
      expect((await reopened.request("/auth/session", undefined, signedIn)).status).toBe(200);
      const visit = await reopened.request("/auth/entry", { kind: "visit", destination }, signedIn);
      expect(visit.status).toBe(revoked ? 403 : 200);
      expect(await visit.json()).toEqual(
        revoked ? { kind: "forbidden" } : { kind: "ok", value: { destination } },
      );
    });
  });
}

for (const change of ["delete-workspace", "remove-membership"] as const) {
  test(`a saved remembered workspace falls back on later sign-in after ${change}`, async () => {
    await withAuth(async ({ open, sql, namespace }) => {
      const server = await open();
      const { cookie } = await claim(server);
      const workspaceId = randomUUID();
      const user = await server.storage.transaction((tx) => tx.userByEmail("alex@example.test"));
      if (!user) throw new Error("Setup must persist a user before granting fixture membership");
      await sql`INSERT INTO ${sql(namespace)}.workspaces (id, name) VALUES (${workspaceId}, 'Remembered workspace')`;
      await sql`INSERT INTO ${sql(namespace)}.auth_workspace_access (user_id, workspace_id) VALUES (${user.id}, ${workspaceId})`;
      const destination = { kind: "workspace-projects", workspaceId };
      const visited = await server.request("/auth/entry", { kind: "visit", destination }, cookie);
      expect(visited.status).toBe(200);
      expect(await visited.json()).toEqual({ kind: "ok", value: { destination } });
      const remembered = await server.request("/auth/entry", { kind: "resolve" }, cookie);
      expect(remembered.status).toBe(200);
      expect(await remembered.json()).toEqual({ kind: "ok", value: { destination } });
      if (change === "delete-workspace") {
        await sql`DELETE FROM ${sql(namespace)}.workspaces WHERE id = ${workspaceId}`;
        expect(
          await sql`SELECT id FROM ${sql(namespace)}.workspaces WHERE id = ${workspaceId}`,
        ).toHaveLength(0);
      } else {
        await sql`DELETE FROM ${sql(namespace)}.auth_workspace_access WHERE user_id = ${user.id} AND workspace_id = ${workspaceId}`;
        expect(
          await sql`SELECT id FROM ${sql(namespace)}.workspaces WHERE id = ${workspaceId}`,
        ).toHaveLength(1);
      }
      const link = await pendingLink(server, "sign-in");
      const reopened = await open();
      const confirmed = await reopened.request("/auth/confirm", link);
      expect(confirmed.status).toBe(200);
      expect(await confirmed.json()).toEqual({
        kind: "ok",
        value: { destination: { kind: "dashboard" } },
      });
      const entry = await reopened.request(
        "/auth/entry",
        { kind: "resolve" },
        confirmationCookie(confirmed),
      );
      expect(entry.status).toBe(200);
      expect(await entry.json()).toEqual({
        kind: "ok",
        value: { destination: { kind: "workspaces" } },
      });
    });
  });
}

for (const purpose of ["setup", "sign-in"] as const) {
  for (const [label, returnTo] of [
    ["external URL", "https://evil.test/steal"],
    ["unsupported destination", { kind: "external", url: "https://evil.test/steal" }],
    [
      "unsupported page name",
      {
        kind: "project-page",
        workspaceId: "00000000-0000-4000-8000-000000000001",
        projectId: "00000000-0000-4000-8000-000000000002",
        page: "unsupported-page",
      },
    ],
  ] as const) {
    test(`${purpose} rejects ${label} returnTo without publishing a link`, async () => {
      await withAuth(async ({ open }) => {
        const server = await open();
        if (purpose === "sign-in") await claim(server);
        const messages = server.inbox.list();
        const response = await server.request(`/auth/${purpose}`, {
          email: "alex@example.test",
          ...(purpose === "setup" ? { name: "Alex" } : {}),
          returnTo,
        });
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ kind: "invalid-input" });
        expect(response.headers.get("set-cookie")).toBeNull();
        expect(server.inbox.list()).toEqual(messages);
        expect((await server.request("/auth/session")).status).toBe(401);
      });
    });
  }
}
