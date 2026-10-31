import { expect, test } from "vite-plus/test";
import { claim, issue, withAuth } from "./test-support/fixture.ts";

test("capture preparation failure preserves the previous link and publishes no replacement", async () => {
  await withAuth(async ({ open, captureFailure }) => {
    const server = await open();
    const old = await issue(server);
    const before = server.inbox.list();
    captureFailure(true);
    const failed = await server.request("/auth/setup", {
      name: "Replacement",
      email: "alex@example.test",
    });
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({ kind: "temporary-failure" });
    expect(server.inbox.list()).toEqual(before);
    captureFailure(false);
    expect(
      (await server.request("/auth/confirm", { purpose: "setup", token: old.token })).status,
    ).toBe(200);
  });
});

for (const fault of ["replacement", "commit"] as const) {
  test(`${fault} rollback preserves the previous active link and aborts capture`, async () => {
    await withAuth(async ({ open, storageFailure }) => {
      const server = await open();
      const old = await issue(server);
      const before = server.inbox.list();
      storageFailure(fault);
      const response = await server.request("/auth/setup", {
        name: "Replacement",
        email: "alex@example.test",
      });
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ kind: "temporary-failure" });
      expect(server.inbox.list()).toEqual(before);
      storageFailure("none");
      expect(
        (await server.request("/auth/confirm", { purpose: "setup", token: old.token })).status,
      ).toBe(200);
    });
  });
}

test("session-write failure rolls back the setup user, marker and token consumption together", async () => {
  await withAuth(async ({ open, storageFailure }) => {
    const server = await open();
    const link = await issue(server);
    storageFailure("session");
    const response = await server.request("/auth/confirm", { purpose: "setup", token: link.token });
    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
    storageFailure("none");
    expect(
      await server.storage.transaction((tx) => tx.userByEmail("alex@example.test")),
    ).toBeNull();
    expect(await server.storage.transaction((tx) => tx.lockSetup())).toBe("open");
    const other = await open();
    expect(await other.storage.transaction((tx) => tx.userByEmail("alex@example.test"))).toBeNull();
    expect(
      (await other.request("/auth/confirm", { purpose: "setup", token: link.token })).status,
    ).toBe(200);
  });
});

test("unknown commit acknowledgment resolves the durable issuance before publishing", async () => {
  await withAuth(async ({ open, storageFailure }) => {
    const server = await open();
    const old = await issue(server);
    storageFailure("ack");
    const response = await server.request("/auth/setup", {
      name: "Replacement",
      email: "alex@example.test",
    });
    storageFailure("none");
    expect(response.status).toBe(200);
    expect(server.inbox.list()).toHaveLength(2);
    const latest = server.inbox.list()[0]?.mail;
    expect(latest).toBeDefined();
    if (!latest) throw new Error("Committed replacement must publish");
    expect(
      await server.storage.resolveIssuance({
        messageId: latest.messageId,
        email: "alex@example.test",
      }),
    ).toBe("committed");
    const replay = await server.request("/auth/confirm", { purpose: "setup", token: old.token });
    expect(replay.status).toBe(400);
    expect(await replay.json()).toEqual({ kind: "superseded-link", next: "setup" });
  });
});

test("discarding a successful response retains the inbox replacement and its durable marker", async () => {
  await withAuth(async ({ open }) => {
    const server = await open();
    const old = await issue(server);
    await server.request("/auth/setup", { name: "Replacement", email: "alex@example.test" });
    const latest = server.inbox.list()[0]?.mail;
    expect(latest?.messageId).not.toBe(old.message.messageId);
    if (!latest) throw new Error("Successful replacement must remain readable after response loss");
    expect(
      await server.storage.resolveIssuance({
        messageId: latest.messageId,
        email: "alex@example.test",
      }),
    ).toBe("committed");
    expect(
      (await server.request("/auth/confirm", { purpose: "setup", token: old.token })).status,
    ).toBe(400);
  });
});

test("healthy control still completes setup after a recovered capture fault", async () => {
  await withAuth(async ({ open, captureFailure }) => {
    const server = await open();
    captureFailure(true);
    expect(
      (await server.request("/auth/setup", { name: "Alex", email: "alex@example.test" })).status,
    ).toBe(503);
    captureFailure(false);
    const { cookie } = await claim(server);
    expect((await server.request("/auth/session", undefined, cookie)).status).toBe(200);
  });
});
