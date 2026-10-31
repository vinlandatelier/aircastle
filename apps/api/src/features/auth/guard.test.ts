import { expect, test } from "vite-plus/test";
import { createApp } from "../../app.ts";
import { createLocalAuth } from "./index.ts";
import { provisionDevelopment } from "@aircastle/core";
import { browserOrigin, claim, withAuth } from "./test-support/fixture.ts";
import pino from "pino";

for (const mode of ["absent", "disabled"] as const) {
  test(`${mode} local auth exposes no mutations or inbox while preserving health`, async () => {
    const auth =
      mode === "disabled" ? await createLocalAuth({ config: { mode: "disabled" } }) : undefined;
    const app = createApp({ logger: pino({ level: "silent" }), ...(auth ? { auth } : {}) });
    try {
      expect((await app.request("/api/health")).status).toBe(200);
      for (const path of [
        "/api/auth/setup",
        "/api/auth/sign-in",
        "/api/auth/confirm",
        "/api/development-inbox/messages/id/open",
      ]) {
        expect(
          (
            await app.request(path, {
              method: "POST",
              body: "{}",
              headers: { "content-type": "application/json" },
            })
          ).status,
        ).toBe(404);
      }
      expect((await app.request("/api/development-inbox/messages")).status).toBe(404);
      if (auth)
        expect(await (await app.request("/api/auth/state")).json()).toEqual({
          kind: "ok",
          value: { kind: "disabled" },
        });
    } finally {
      await auth?.close();
    }
  });
}

for (const [method, path] of [
  ["POST", "/auth/sign-up/email"],
  ["POST", "/auth/sign-in/anonymous"],
  ["POST", "/auth/sign-in/social"],
  ["POST", "/auth/update-user"],
  ["POST", "/auth/update-session"],
  ["GET", "/auth/get-session"],
  ["GET", "/auth/list-sessions"],
  ["GET", "/auth/verify-email"],
  ["POST", "/auth/admin/create-user"],
  ["POST", "/auth/setup/"],
  ["POST", "/auth/%73ign-up/email"],
  ["GET", "/auth/confirm"],
] as const) {
  test(`unlisted library route ${method} ${path} is unavailable`, async () => {
    await withAuth(async ({ open }) => {
      const server = await open();
      const response = await server.app.request(
        `${browserOrigin}/api${path}`,
        {
          method,
          headers: {
            origin: browserOrigin,
            host: "localhost:43121",
            "content-type": "application/json",
          },
          ...(method === "POST"
            ? {
                body: JSON.stringify({
                  name: "Attacker",
                  email: "attack@example.test",
                  password: "password",
                  role: "super_user",
                }),
              }
            : {}),
        },
        { peerAddress: "127.0.0.1" },
      );
      expect(response.status).toBe(404);
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(
        await server.storage.transaction((tx) => tx.userByEmail("attack@example.test")),
      ).toBeNull();
    });
  });
}

for (const body of [
  { name: "Alex", email: "alex@example.test", role: "super_user" },
  { name: "Alex", email: "alex@example.test", authority: "super_user" },
  { name: "Alex", email: "alex@example.test", userId: "chosen-id" },
  { name: "Alex", email: "alex@example.test", callbackURL: "https://evil.test" },
  { name: "Alex", email: "alex@example.test", returnTo: "//evil.test" },
]) {
  test(`setup rejects unexpected or unsafe transport metadata ${JSON.stringify(body)}`, async () => {
    await withAuth(async ({ open }) => {
      const server = await open();
      const response = await server.request("/auth/setup", body);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ kind: "invalid-input" });
      expect(server.inbox.list()).toHaveLength(0);
    });
  });
}

test("configured initial email restriction returns forbidden without capture", async () => {
  await withAuth(async ({ open }) => {
    const server = await open("owner@example.test");
    const response = await server.request("/auth/setup", {
      name: "Alex",
      email: "alex@example.test",
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ kind: "email-not-allowed" });
    expect(server.inbox.list()).toHaveLength(0);
  });
});

test("sign-in cannot rewrite name or authority after setup", async () => {
  await withAuth(async ({ open }) => {
    const server = await open();
    await claim(server);
    const response = await server.request("/auth/sign-in", {
      email: "alex@example.test",
      name: "Attacker",
      role: "super_user",
    });
    expect(response.status).toBe(400);
    expect(
      await server.storage.transaction((tx) => tx.userByEmail("alex@example.test")),
    ).toMatchObject({ name: "Alex" });
  });
});

for (const headers of [
  { origin: "https://evil.test" },
  { host: "evil.test", "x-forwarded-host": "localhost:43121" },
  { origin: "http://127.0.0.1:43121" },
]) {
  test(`untrusted origin/authority ${JSON.stringify(headers)} cannot issue a link`, async () => {
    await withAuth(async ({ open }) => {
      const server = await open();
      const response = await server.request(
        "/auth/setup",
        { name: "Alex", email: "alex@example.test" },
        undefined,
        headers,
      );
      expect(response.status).toBe(403);
      expect(server.inbox.list()).toHaveLength(0);
    });
  });
}

test("project API key cannot authenticate a browser session", async () => {
  await withAuth(async ({ open, content }) => {
    const project = await provisionDevelopment(content);
    expect(project.issued).toBe(true);
    if (!project.issued) throw new Error("Fresh namespace must issue a real project key");
    const server = await open();
    const authorization = { authorization: `Bearer ${project.apiKey}` };
    const control = await server.request(
      `/projects/${project.project}/schema`,
      undefined,
      undefined,
      authorization,
    );
    expect(control.status).toBe(200);
    expect(await control.json()).toEqual({ ok: true, data: { revision: null, collections: [] } });
    const response = await server.request("/auth/session", undefined, undefined, authorization);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ kind: "unauthenticated" });
  });
});

test("browser cookie alone never substitutes for a project key on content routes", async () => {
  await withAuth(async ({ open, content }) => {
    const project = await content.provision({
      verifier: "fixture-digest",
      permissions: ["content:read"],
      key: "reuse",
      workspaceName: "Development workspace",
      projectName: "Development project",
    });
    const server = await open();
    const { cookie } = await claim(server);
    const response = await server.request(`/projects/${project.project}/schema`, undefined, cookie);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: { code: "unauthorized" } });
  });
});
