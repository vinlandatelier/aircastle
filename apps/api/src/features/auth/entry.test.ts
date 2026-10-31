import { expect, test } from "vite-plus/test";
import { claim, withAuth } from "./test-support/fixture.ts";

for (const body of [
  { kind: "resolve" },
  { kind: "skip-onboarding" },
  { kind: "visit", destination: { kind: "workspaces" } },
]) {
  test(`protected entry ${body.kind} checks the session without a setup dependency`, async () => {
    await withAuth(async ({ open }) => {
      const server = await open();
      const response = await server.request("/auth/entry", body);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ kind: "unauthenticated" });
    });
  });
}

test("onboarding is offered once and survives leaving without an explicit skip", async () => {
  await withAuth(async ({ open }) => {
    const server = await open();
    const { cookie } = await claim(server);
    const first = await server.request("/auth/entry", { kind: "resolve" }, cookie);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({
      kind: "ok",
      value: { destination: { kind: "create-workspace" } },
    });
    const reopened = await open();
    expect(
      await (await reopened.request("/auth/entry", { kind: "resolve" }, cookie)).json(),
    ).toEqual({ kind: "ok", value: { destination: { kind: "workspaces" } } });
  });
});

test("skip persists and never invents a workspace", async () => {
  await withAuth(async ({ open, sql, namespace }) => {
    const server = await open();
    const { cookie } = await claim(server);
    const skipped = await server.request("/auth/entry", { kind: "skip-onboarding" }, cookie);
    expect(skipped.status).toBe(200);
    expect(await skipped.json()).toEqual({
      kind: "ok",
      value: { destination: { kind: "workspaces" } },
    });
    const reopened = await open();
    expect(
      await (await reopened.request("/auth/entry", { kind: "resolve" }, cookie)).json(),
    ).toEqual({ kind: "ok", value: { destination: { kind: "workspaces" } } });
    expect(await sql`SELECT id FROM ${sql(namespace)}.workspaces`).toHaveLength(0);
  });
});

test("instance authority does not implicitly grant access to a content workspace", async () => {
  await withAuth(async ({ open, content }) => {
    const project = await content.provision({
      verifier: "fixture-key-digest",
      permissions: ["content:read"],
      key: "reuse",
      workspaceName: "Development workspace",
      projectName: "Development project",
    });
    const server = await open();
    const { cookie } = await claim(server);
    const response = await server.request(
      "/auth/entry",
      {
        kind: "visit",
        destination: { kind: "workspace-projects", workspaceId: project.workspace },
      },
      cookie,
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ kind: "forbidden" });
  });
});

test("fixture-granted membership authorizes requested entry and persists the last workspace", async () => {
  await withAuth(async ({ open, content, sql, namespace }) => {
    const project = await content.provision({
      verifier: "fixture-key-digest",
      permissions: ["content:read"],
      key: "reuse",
      workspaceName: "Development workspace",
      projectName: "Development project",
    });
    const server = await open();
    const { cookie } = await claim(server);
    const user = await server.storage.transaction((tx) => tx.userByEmail("alex@example.test"));
    if (!user) throw new Error("Claim must persist a user before membership fixture insertion");
    await sql`INSERT INTO ${sql(namespace)}.auth_workspace_access (user_id, workspace_id) VALUES (${user.id}, ${project.workspace})`;
    const destination = { kind: "workspace-projects", workspaceId: project.workspace };
    const visit = await server.request("/auth/entry", { kind: "visit", destination }, cookie);
    expect(visit.status).toBe(200);
    expect(await visit.json()).toEqual({ kind: "ok", value: { destination } });
    const reopened = await open();
    expect(
      await (await reopened.request("/auth/entry", { kind: "resolve" }, cookie)).json(),
    ).toEqual({ kind: "ok", value: { destination } });
    await sql`DELETE FROM ${sql(namespace)}.auth_workspace_access WHERE user_id = ${user.id}`;
    expect(
      await (await reopened.request("/auth/entry", { kind: "resolve" }, cookie)).json(),
    ).toEqual({ kind: "ok", value: { destination: { kind: "workspaces" } } });
  });
});

test("project return target must belong to the authorized workspace", async () => {
  await withAuth(async ({ open, content, sql, namespace }) => {
    const a = await content.provision({
      verifier: "first-digest",
      permissions: ["content:read"],
      key: "reuse",
      workspaceName: "First",
      projectName: "First",
    });
    const b = await content.provision({
      verifier: "second-digest",
      permissions: ["content:read"],
      key: "reuse",
      workspaceName: "Second",
      projectName: "Second",
    });
    const server = await open();
    const { cookie } = await claim(server);
    const user = await server.storage.transaction((tx) => tx.userByEmail("alex@example.test"));
    if (!user) throw new Error("Claim must persist user");
    await sql`INSERT INTO ${sql(namespace)}.auth_workspace_access (user_id, workspace_id) VALUES (${user.id}, ${a.workspace})`;
    const bad = {
      kind: "project-page",
      workspaceId: a.workspace,
      projectId: b.project,
      page: "collections",
    };
    expect(
      (await server.request("/auth/entry", { kind: "visit", destination: bad }, cookie)).status,
    ).toBe(403);
    const good = { ...bad, projectId: a.project };
    expect(
      (await server.request("/auth/entry", { kind: "visit", destination: good }, cookie)).status,
    ).toBe(200);
  });
});

test("authorized requested destination takes priority over onboarding and records it as skipped", async () => {
  await withAuth(async ({ open, content, sql, namespace }) => {
    const project = await content.provision({
      verifier: "entry-fixture-digest",
      permissions: ["content:read"],
      key: "reuse",
      workspaceName: "Development workspace",
      projectName: "Development project",
    });
    const server = await open();
    const { cookie } = await claim(server);
    const user = await server.storage.transaction((tx) => tx.userByEmail("alex@example.test"));
    if (!user) throw new Error("Claim must persist user");
    await sql`INSERT INTO ${sql(namespace)}.auth_workspace_access (user_id, workspace_id) VALUES (${user.id}, ${project.workspace})`;
    const destination = {
      kind: "project-page",
      workspaceId: project.workspace,
      projectId: project.project,
      page: "collections",
    };
    const response = await server.request(
      "/auth/entry",
      { kind: "resolve", requested: destination },
      cookie,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ kind: "ok", value: { destination } });
    await sql`DELETE FROM ${sql(namespace)}.auth_workspace_access WHERE user_id = ${user.id}`;
    expect(await (await server.request("/auth/entry", { kind: "resolve" }, cookie)).json()).toEqual(
      { kind: "ok", value: { destination: { kind: "workspaces" } } },
    );
  });
});

test("unauthorized requested destination falls back to the first onboarding offer", async () => {
  await withAuth(async ({ open }) => {
    const server = await open();
    const { cookie } = await claim(server);
    const response = await server.request(
      "/auth/entry",
      {
        kind: "resolve",
        requested: {
          kind: "workspace-projects",
          workspaceId: "00000000-0000-4000-8000-000000000001",
        },
      },
      cookie,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      kind: "ok",
      value: { destination: { kind: "create-workspace" } },
    });
  });
});
