import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { expect, test } from "vite-plus/test";
import { collection, text } from "@aircastle/schema";
import { createClient, defineConfig } from "@aircastle/client";
import { postgresAdapter } from "@aircastle/adapter-postgres";
import { provisionDevelopment } from "@aircastle/core";
import {
  developerApp,
  execute,
  repository,
  processDeadlines,
  standaloneServer,
} from "./support/content-processes.ts";

const shutdownBudget = processDeadlines.stop + processDeadlines.kill;
const serverTestBudget = processDeadlines.start + shutdownBudget + 30_000;
const durableWorkflowBudget =
  2 * (processDeadlines.start + shutdownBudget) + processDeadlines.command + 30_000;

test(
  "standalone server rejects unknown credentials before revealing project schema",
  async () => {
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
  },
  serverTestBudget,
);

test(
  "developer config, push, SDK create/read and restart form one durable workflow",
  async () => {
    const namespace = `workflow_${randomUUID().replaceAll("-", "")}`;
    const store = postgresAdapter({ url: process.env.DATABASE_URL ?? "", namespace });
    const app = await developerApp();
    let server: Awaited<ReturnType<typeof standaloneServer>> | undefined;
    try {
      await store.initialize();
      server = await standaloneServer(namespace);
      const provisioned = await provisionDevelopment(store);
      expect(provisioned.apiKey).toEqual(expect.any(String));
      const key = provisioned.apiKey;
      const env = {
        AIRCASTLE_URL: server.url,
        AIRCASTLE_PROJECT_ID: provisioned.project,
        AIRCASTLE_API_KEY: key,
      };
      const metadata: { bin: { aircastle: string } } = JSON.parse(
        await readFile(join(repository, "packages/cli/package.json"), "utf8"),
      );
      const result = await execute(
        resolve(repository, "packages/cli", metadata.bin.aircastle),
        ["push"],
        {
          cwd: app.cwd,
          env,
        },
      );
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
      try {
        await server?.close();
      } finally {
        try {
          await store.close();
        } finally {
          await app.cleanup();
        }
      }
    }
  },
  durableWorkflowBudget,
);

test(
  "built API honors the configured request-byte limit with valid credentials",
  async () => {
    const namespace = `workflow_${randomUUID().replaceAll("-", "")}`;
    const store = postgresAdapter({ url: process.env.DATABASE_URL ?? "", namespace });
    try {
      await store.initialize();
      const provisioned = await provisionDevelopment(store);
      const server = await standaloneServer(namespace, { AIRCASTLE_MAX_REQUEST_BYTES: "128" });
      try {
        const endpoint = `${server.url}/api/projects/${provisioned.project}/schema`;
        const headers = {
          authorization: `Bearer ${provisioned.apiKey}`,
          "content-type": "application/json",
        };
        const authorized = await fetch(endpoint, { headers });
        expect(authorized.status).toBe(200);
        await authorized.json();
        const body = JSON.stringify({ baseline: null, collections: [] });
        const accepted = await fetch(endpoint, {
          method: "POST",
          headers,
          body: body.padEnd(128),
        });
        expect(accepted.status).toBe(200);
        expect(await accepted.json()).toMatchObject({ ok: true });
        const response = await fetch(endpoint, {
          method: "POST",
          headers,
          body: body.padEnd(129),
        });
        expect(response.status).toBe(413);
        expect(await response.json()).toEqual({ ok: false, error: { code: "payload_too_large" } });
      } finally {
        await server.close();
      }
    } finally {
      await store.close();
    }
  },
  serverTestBudget,
);

test(
  "built API exits successfully on SIGTERM and releases its listener",
  async () => {
    const namespace = `workflow_${randomUUID().replaceAll("-", "")}`;
    const server = await standaloneServer(namespace);
    try {
      await server.close();
      const listener = createServer();
      await new Promise<void>((resolve, reject) => {
        listener.once("error", reject);
        listener.listen(Number(new URL(server.url).port), "127.0.0.1", resolve);
      });
      await new Promise<void>((resolve, reject) => {
        listener.close((error) => (error ? reject(error) : resolve()));
      });
    } finally {
      await server.close();
    }
  },
  serverTestBudget,
);
