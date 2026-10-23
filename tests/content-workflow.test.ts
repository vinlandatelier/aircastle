import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import { collection, text } from "@aircastle/schema";
import { createClient, defineConfig } from "@aircastle/client";
import { postgresAdapter } from "@aircastle/adapter-postgres";
import { provisionDevelopment } from "@aircastle/core";
import {
  developerApp,
  execute,
  repository,
  standaloneServer,
} from "./support/content-processes.ts";

test("standalone server rejects unknown credentials before revealing project schema", async () => {
  const namespace = `workflow_${randomUUID().replaceAll("-", "")}`;
  const server = await standaloneServer(namespace);
  try {
    const health = await fetch(`${server.url}/api/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: "ok" });
    const response = await fetch(
      `${server.url}/api/projects/11111111-1111-4111-8111-111111111111/schema`,
      { headers: { authorization: "Bearer unknown-project-secret" } },
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: { code: "unauthorized" } });
  } finally {
    await server.close();
  }
});

test("developer config, push, SDK create/read and restart form one durable workflow", async () => {
  const namespace = `workflow_${randomUUID().replaceAll("-", "")}`;
  const store = postgresAdapter({ url: process.env.DATABASE_URL ?? "", namespace });
  await store.initialize();
  let server = await standaloneServer(namespace);
  const app = await developerApp();
  try {
    const provisioned = await provisionDevelopment(store);
    expect(provisioned.apiKey).toEqual(expect.any(String));
    const key = provisioned.apiKey;
    const env = {
      AIRCASTLE_URL: server.url,
      AIRCASTLE_PROJECT_ID: provisioned.project,
      AIRCASTLE_API_KEY: key,
    };
    const result = await execute("bun", [join(repository, "packages/cli/src/cli.ts"), "push"], {
      cwd: app.cwd,
      env,
    });
    expect(result.code, result.output).toBe(0);
    const lock = JSON.parse(await readFile(join(app.cwd, "aircastle.lock"), "utf8"));
    expect(lock.target).toEqual({ url: server.url, project: provisioned.project });
    expect(JSON.stringify(lock)).not.toContain(key);
    const config = defineConfig({
      url: server.url,
      project: provisioned.project,
      collections: {
        articles: collection({
          title: text().min(1),
          slug: text().unique(),
          summary: text().optional(),
          status: text().oneOf(["draft", "published"]).default("draft"),
        }),
      },
    });
    const client = createClient({ ...config, apiKey: key });
    const created = await client.articles.create({ title: "Hello", slug: "hello" });
    expect(created).toEqual({
      ok: true,
      data: { id: expect.any(String), title: "Hello", slug: "hello", status: "draft" },
    });
    if (!created.ok) throw new Error("Expected a saved document");
    const saved = created.data;
    expect(await client.articles.findById(saved.id)).toEqual({ ok: true, data: saved });
    expect(await client.articles.create({ title: "Duplicate", slug: "hello" })).toEqual({
      ok: false,
      error: { code: "unique_conflict", field: "slug" },
    });
    await server.close();
    server = await standaloneServer(namespace);
    const restarted = createClient({ ...config, url: server.url, apiKey: key });
    expect(await restarted.articles.findById(saved.id)).toEqual({ ok: true, data: saved });
    const rerun = await provisionDevelopment(store);
    expect(rerun.project).toBe(provisioned.project);
    expect(rerun.apiKey).toBeUndefined();
    expect(await restarted.articles.findById(saved.id)).toEqual({ ok: true, data: saved });
  } finally {
    await server.close();
    await store.close();
    await app.cleanup();
  }
});
