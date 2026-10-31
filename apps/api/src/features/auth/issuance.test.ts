import { expect, test } from "vite-plus/test";
import { browserOrigin, claim, issue, start, withAuth } from "./test-support/fixture.ts";

const invalid = { kind: "invalid-link", next: "setup" };

test("request captures the actual normalized setup email without creating an identity or session", async () => {
  await withAuth(async ({ open }) => {
    const server = await open();
    const link = await issue(server, " Alex@Example.Test ", "  Alex  Rivera  ");
    expect(link.message.to).toEqual(["alex@example.test"]);
    expect(link.message.from).toBe("Aircastle <no-reply@aircastle.test>");
    expect(link.message.subject).toBe("Create your Aircastle account");
    expect(link.message.text).toContain("Confirm your email to create your account.");
    expect(link.message.text).toContain("Alex  Rivera");
    expect(link.message.text).toContain("This link expires in 5 minutes.");
    expect(link.message.html).toContain("Continue");
    expect(Date.parse(link.message.date)).toBe(start);
    expect(new URL(link.link).origin).toBe(browserOrigin);
    expect(
      await server.storage.transaction((tx) => tx.userByEmail("alex@example.test")),
    ).toBeNull();
    expect(await (await server.request("/auth/state")).json()).toEqual({
      kind: "ok",
      value: { kind: "setup-required" },
    });
    expect((await server.request("/auth/session")).status).toBe(401);
  });
});

test("preview returns the request identity repeatedly without consuming it or setting a cookie", async () => {
  await withAuth(async ({ open }) => {
    const server = await open();
    const link = await issue(server);
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await server.request("/auth/confirm/preview", {
        purpose: "setup",
        token: link.token,
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        kind: "ok",
        value: { purpose: "setup", email: "alex@example.test" },
      });
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    }
    expect(
      await server.storage.transaction((tx) => tx.userByEmail("alex@example.test")),
    ).toBeNull();
    expect(
      (await server.request("/auth/confirm", { purpose: "setup", token: link.token })).status,
    ).toBe(200);
  });
});

test("replacement supersedes only the same normalized email and preserves each request name", async () => {
  await withAuth(async ({ open }) => {
    const server = await open();
    const old = await issue(server, "alex@example.test", "Old name");
    const independent = await issue(server, "other@example.test", "Other name");
    const latest = await issue(server, "ALEX@example.test", "New name");
    const response = await server.request("/auth/confirm/preview", {
      purpose: "setup",
      token: old.token,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ kind: "superseded-link", next: "setup" });
    expect(
      (
        await server.request("/auth/confirm/preview", {
          purpose: "setup",
          token: independent.token,
        })
      ).status,
    ).toBe(200);
    expect(
      (await server.request("/auth/confirm", { purpose: "setup", token: latest.token })).status,
    ).toBe(200);
    const user = await server.storage.transaction((tx) => tx.userByEmail("alex@example.test"));
    expect(user?.name).toBe("New name");
  });
});

test("expired superseded links use the generic invalid outcome", async () => {
  await withAuth(async ({ open, at }) => {
    const server = await open();
    const old = await issue(server);
    at(1_000);
    await issue(server);
    at(300_000);
    const response = await server.request("/auth/confirm/preview", {
      purpose: "setup",
      token: old.token,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(invalid);
  });
});

test("known and unknown sign-in requests have exactly the same public classification", async () => {
  await withAuth(async ({ open }) => {
    const server = await open();
    await claim(server);
    const before = server.inbox.list().length;
    const known = await server.request("/auth/sign-in", { email: " ALEX@EXAMPLE.TEST " });
    const unknown = await server.request("/auth/sign-in", { email: "unknown@example.test" });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    const expected = { kind: "ok", value: { confirmation: "sign-in-inbox" } };
    expect(await known.json()).toEqual(expected);
    expect(await unknown.json()).toEqual(expected);
    expect(server.inbox.list()).toHaveLength(before + 1);
    const mail = server.inbox.list()[0]?.mail;
    expect(mail?.subject).toBe("Sign in to Aircastle");
    expect(mail?.text).toContain("Use this link to sign in.");
    expect(
      await server.storage.transaction((tx) => tx.userByEmail("unknown@example.test")),
    ).toBeNull();
  });
});

test("successful requests never include the usable token in the HTTP response or logs", async () => {
  await withAuth(async ({ open, logs, events }) => {
    const server = await open();
    const link = await issue(server);
    expect(JSON.stringify({ logs, events })).not.toContain(link.token);
    expect(JSON.stringify({ logs, events })).not.toContain(link.message.text);
    expect((await server.request("/development-inbox/messages")).headers.get("cache-control")).toBe(
      "no-store",
    );
  });
});

test("link record storage keeps a digest and never the raw credential", async () => {
  await withAuth(async ({ open, sql, namespace }) => {
    const server = await open();
    const link = await issue(server);
    const tables = await sql<
      { table_name: string }[]
    >`SELECT table_name FROM information_schema.tables WHERE table_schema = ${namespace}`;
    const rows: unknown[] = [];
    for (const table of tables)
      rows.push(
        await sql`SELECT row_to_json(record) AS data FROM ${sql(namespace)}.${sql(table.table_name)} AS record`,
      );
    expect(JSON.stringify(rows)).not.toContain(link.token);
    expect(server.inbox.list().some((entry) => entry.mail.text.includes(link.token))).toBe(true);
  });
});
