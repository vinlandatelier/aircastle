import { expect, test } from "vite-plus/test";
import { issue, withAuth } from "./test-support/fixture.ts";

test("real deferred COMMIT constraint failure preserves the prior link and cancels inbox publication", async () => {
  await withAuth(async ({ open, sql, namespace }) => {
    const server = await open();
    const old = await issue(server);
    await sql`CREATE TABLE ${sql(namespace)}.fixture_commit_guard (id integer PRIMARY KEY)`;
    await sql`CREATE TABLE ${sql(namespace)}.fixture_commit_fault (
      id integer REFERENCES ${sql(namespace)}.fixture_commit_guard(id) DEFERRABLE INITIALLY DEFERRED)`;
    await sql`CREATE FUNCTION ${sql(namespace)}.inject_commit_fault() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN INSERT INTO ${sql(namespace)}.fixture_commit_fault VALUES (1); RETURN NEW; END $$`;
    await sql`CREATE TRIGGER fixture_commit_fault AFTER INSERT ON ${sql(namespace)}.auth_links
      FOR EACH ROW EXECUTE FUNCTION ${sql(namespace)}.inject_commit_fault()`;
    const response = await server.request("/auth/setup", {
      name: "Replacement",
      email: "alex@example.test",
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ kind: "temporary-failure" });
    expect(server.inbox.list()).toHaveLength(1);
    expect(await sql`SELECT id FROM ${sql(namespace)}.fixture_commit_fault`).toHaveLength(0);
    await sql`DROP TRIGGER fixture_commit_fault ON ${sql(namespace)}.auth_links`;
    expect(
      (await server.request("/auth/confirm", { purpose: "setup", token: old.token })).status,
    ).toBe(200);
  });
});

test("real session INSERT trigger rolls back claim, user and consumption without setting a cookie", async () => {
  await withAuth(async ({ open, sql, namespace }) => {
    const server = await open();
    const link = await issue(server);
    await sql`CREATE FUNCTION ${sql(namespace)}.reject_session() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'test session write fault' USING ERRCODE = '23514'; END $$`;
    await sql`CREATE TRIGGER fixture_session_fault BEFORE INSERT ON ${sql(namespace)}.auth_sessions
      FOR EACH ROW EXECUTE FUNCTION ${sql(namespace)}.reject_session()`;
    const response = await server.request("/auth/confirm", { purpose: "setup", token: link.token });
    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await sql`SELECT id FROM ${sql(namespace)}.auth_users`).toHaveLength(0);
    expect(await sql`SELECT id FROM ${sql(namespace)}.auth_sessions`).toHaveLength(0);
    const other = await open();
    expect(await other.storage.transaction((tx) => tx.lockSetup())).toBe("open");
    await sql`DROP TRIGGER fixture_session_fault ON ${sql(namespace)}.auth_sessions`;
    expect(
      (await other.request("/auth/confirm", { purpose: "setup", token: link.token })).status,
    ).toBe(200);
  });
});
