import { expect, test } from "vite-plus/test";
import { claim, issue, withAuth } from "./test-support/fixture.ts";

for (const token of ["", "garbage", "x".repeat(43)]) {
  test(`missing, malformed or unknown token ${JSON.stringify(token)} returns invalid without completing setup`, async () => {
    await withAuth(async ({ open }) => {
      const server = await open();
      const response = await server.request("/auth/confirm", { purpose: "setup", token });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ kind: "invalid-link", next: "setup" });
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(await (await server.request("/auth/state")).json()).toEqual({
        kind: "ok",
        value: { kind: "setup-required" },
      });
    });
  });
}

for (const elapsed of [299_999, 300_000, 300_001]) {
  test(`setup token strict 300-second lifetime at ${elapsed} milliseconds`, async () => {
    await withAuth(async ({ open, at }) => {
      const server = await open();
      const link = await issue(server);
      at(elapsed);
      const response = await server.request("/auth/confirm", {
        purpose: "setup",
        token: link.token,
      });
      expect(response.status).toBe(elapsed < 300_000 ? 200 : 400);
      if (elapsed >= 300_000) {
        expect(await response.json()).toEqual({ kind: "invalid-link", next: "setup" });
        expect(
          await server.storage.transaction((tx) => tx.userByEmail("alex@example.test")),
        ).toBeNull();
      }
    });
  });
}

test("setup confirmation assigns server identity and super-user authority without creating a workspace", async () => {
  await withAuth(async ({ open, sql, namespace }) => {
    const server = await open();
    const { cookie } = await claim(server);
    const response = await server.request("/auth/session", undefined, cookie);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      kind: "ok",
      value: { user: { name: "Alex", email: "alex@example.test", authority: "super_user" } },
    });
    expect(body).toMatchObject({ value: { user: { id: expect.any(String) } } });
    expect(await sql`SELECT id FROM ${sql(namespace)}.workspaces`).toHaveLength(0);
    expect(await sql`SELECT id FROM ${sql(namespace)}.projects`).toHaveLength(0);
  });
});

test("consumed token replay from a signed-out browser cannot create another session", async () => {
  await withAuth(async ({ open }) => {
    const server = await open();
    const { link } = await claim(server);
    const response = await server.request("/auth/confirm", { purpose: "setup", token: link.token });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ kind: "invalid-link", next: "sign-in" });
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});

test("unused losing setup token reports completed setup and never creates its user", async () => {
  await withAuth(async ({ open }) => {
    const server = await open();
    const losing = await issue(server, "loser@example.test", "Loser");
    await claim(server);
    const response = await server.request("/auth/confirm", {
      purpose: "setup",
      token: losing.token,
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ kind: "setup-complete" });
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(
      await server.storage.transaction((tx) => tx.userByEmail("loser@example.test")),
    ).toBeNull();
  });
});

test("setup token cannot be redeemed with sign-in purpose", async () => {
  await withAuth(async ({ open }) => {
    const server = await open();
    const link = await issue(server);
    const wrong = await server.request("/auth/confirm", { purpose: "sign-in", token: link.token });
    expect(wrong.status).toBe(400);
    expect(await wrong.json()).toEqual({ kind: "invalid-link", next: "setup" });
    expect(
      (await server.request("/auth/confirm", { purpose: "setup", token: link.token })).status,
    ).toBe(200);
  });
});

test("parallel confirmations of one token issue exactly one browser cookie", async () => {
  await withAuth(async ({ open }) => {
    const first = await open();
    const second = await open();
    const link = await issue(first);
    const responses = await Promise.all(
      [first, second].map((server) =>
        server.request("/auth/confirm", { purpose: "setup", token: link.token }),
      ),
    );
    expect(responses.map((response) => response.status).sort((a, b) => a - b)).toEqual([200, 400]);
    expect(responses.filter((response) => response.headers.has("set-cookie"))).toHaveLength(1);
  });
});

test("competing identities across runtimes leave one user and one losing claim", async () => {
  await withAuth(async ({ open }) => {
    const first = await open();
    const second = await open();
    const a = await issue(first);
    const b = await issue(second, "other@example.test", "Other");
    const responses = await Promise.all([
      first.request("/auth/confirm", { purpose: "setup", token: a.token }),
      second.request("/auth/confirm", { purpose: "setup", token: b.token }),
    ]);
    expect(responses.map((response) => response.status).sort((a, b) => a - b)).toEqual([200, 409]);
    const users = await first.storage.transaction(async (tx) => [
      await tx.userByEmail("alex@example.test"),
      await tx.userByEmail("other@example.test"),
    ]);
    expect(users.filter(Boolean)).toHaveLength(1);
  });
});

test("deleting the initial user and reopening never reopens permanent setup", async () => {
  await withAuth(async ({ open, sql, namespace }) => {
    const server = await open();
    await claim(server);
    const user = await server.storage.transaction((tx) => tx.userByEmail("alex@example.test"));
    expect(user).not.toBeNull();
    if (!user) throw new Error("Claim must persist user");
    await sql`DELETE FROM ${sql(namespace)}.auth_users WHERE id = ${user.id}`;
    const reopened = await open();
    expect(await (await reopened.request("/auth/state")).json()).toEqual({
      kind: "ok",
      value: { kind: "signed-out" },
    });
    expect(
      (await reopened.request("/auth/setup", { name: "Other", email: "other@example.test" }))
        .status,
    ).toBe(409);
  });
});
