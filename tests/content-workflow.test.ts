import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { expect, test } from "vite-plus/test";
import { collection, text } from "@aircastle/schema";
import { createClient, defineConfig } from "@aircastle/client";
import { postgresAdapter } from "@aircastle/adapter-postgres";
import { provisionDevelopment } from "@aircastle/core";
import {
  bindLoopbackPort,
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
      expect(provisioned).toEqual({
        workspace: expect.any(String),
        project: expect.any(String),
        issued: true,
        apiKey: expect.any(String),
      });
      if (!provisioned.issued) throw new Error("Expected a new API key");
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
      expect(rerun).toEqual({
        workspace: provisioned.workspace,
        project: provisioned.project,
        issued: false,
      });
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
      if (!provisioned.issued) throw new Error("Expected a new API key");
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
      await bindLoopbackPort(Number(new URL(server.url).port));
    } finally {
      await server.close();
    }
  },
  serverTestBudget,
);

test(
  "R1-R13 SDK lifecycle: update, unset, paged lists, delete and a long-title cursor",
  async () => {
    const namespace = `workflow_${randomUUID().replaceAll("-", "")}`;
    const store = postgresAdapter({ url: process.env.DATABASE_URL ?? "", namespace });
    const app = await developerApp();
    let server: Awaited<ReturnType<typeof standaloneServer>> | undefined;
    try {
      await store.initialize();
      server = await standaloneServer(namespace);
      const provisioned = await provisionDevelopment(store);
      if (!provisioned.issued) throw new Error("Expected a new API key");
      const metadata: { bin: { aircastle: string } } = JSON.parse(
        await readFile(join(repository, "packages/cli/package.json"), "utf8"),
      );
      const pushed = await execute(
        resolve(repository, "packages/cli", metadata.bin.aircastle),
        ["push"],
        {
          cwd: app.cwd,
          env: {
            AIRCASTLE_URL: server.url,
            AIRCASTLE_PROJECT_ID: provisioned.project,
            AIRCASTLE_API_KEY: provisioned.apiKey,
          },
        },
      );
      expect(pushed.code, pushed.output).toBe(0);
      const client = createClient({
        ...defineConfig({
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
        }),
        apiKey: provisioned.apiKey,
      });
      const create = async (input: Parameters<typeof client.articles.create>[0]) => {
        const created = await client.articles.create(input);
        expect(created).toEqual({
          ok: true,
          data: { status: "draft", ...input, id: expect.any(String) },
        });
        if (!created.ok) throw new Error("Expected a saved document");
        return created.data;
      };
      const apple = await create({ title: "Apple", slug: "apple", status: "published" });
      const banana = await create({ title: "Banana", slug: "banana", summary: "Yellow" });
      const cherry = await create({
        title: "Cherry",
        slug: "cherry",
        summary: "Red",
        status: "published",
      });
      const zebra = await create({ title: "Zebra", slug: "zebra", status: "published" });

      const apricot = { ...apple, title: "Apricot" };
      expect(await client.articles.update(apple.id, { title: "Apricot" })).toEqual({
        ok: true,
        data: apricot,
      });
      expect(await client.articles.update(zebra.id.toUpperCase(), { title: "Zebra" })).toEqual({
        ok: true,
        data: zebra,
      });
      const cherryPie = {
        id: cherry.id,
        title: "Cherry pie",
        slug: "cherry",
        status: "published",
      };
      expect(
        await client.articles.update(cherry.id, { title: "Cherry pie" }, { unset: ["summary"] }),
      ).toEqual({ ok: true, data: cherryPie });
      expect(await client.articles.findById(cherry.id)).toEqual({ ok: true, data: cherryPie });

      const first = await client.articles.list({
        where: { status: "published" },
        sort: "-title",
        limit: 2,
      });
      expect(first).toEqual({
        ok: true,
        data: { documents: [zebra, cherryPie], next: expect.any(String) },
      });
      if (!first.ok || first.data.next === null) throw new Error("Expected a second page");
      expect(
        await client.articles.list({
          where: { status: "published" },
          sort: "-title",
          limit: 2,
          cursor: first.data.next,
        }),
      ).toEqual({ ok: true, data: { documents: [apricot], next: null } });
      expect(await client.articles.list({ where: { summary: { empty: false } } })).toEqual({
        ok: true,
        data: { documents: [banana], next: null },
      });
      expect(await client.articles.list({ limit: 3 })).toEqual({
        ok: true,
        data: { documents: [zebra, cherryPie, banana], next: expect.any(String) },
      });

      expect(await client.articles.delete(banana.id)).toEqual({
        ok: true,
        data: { id: banana.id },
      });
      expect(await client.articles.delete(banana.id)).toEqual({
        ok: false,
        error: { code: "not_found" },
      });
      expect(await client.articles.findById(banana.id)).toEqual({
        ok: false,
        error: { code: "not_found" },
      });
      const recreated = await create({ title: "Banana bread", slug: "banana" });
      expect(recreated.id).not.toBe(banana.id);

      const long = await create({
        title: `Long ${"x".repeat(20 * 1024)}`,
        slug: "long",
        status: "published",
      });
      const firstSorted = await client.articles.list({
        where: { status: "published" },
        sort: "title",
        limit: 3,
      });
      expect(firstSorted).toEqual({
        ok: true,
        data: { documents: [apricot, cherryPie, long], next: expect.any(String) },
      });
      if (!firstSorted.ok || firstSorted.data.next === null)
        throw new Error("Expected a cursor after the long title");
      expect(
        await client.articles.list({
          where: { status: "published" },
          sort: "title",
          limit: 3,
          cursor: firstSorted.data.next,
        }),
      ).toEqual({ ok: true, data: { documents: [zebra], next: null } });
      expect(await client.articles.list()).toEqual({
        ok: true,
        data: { documents: [long, recreated, zebra, cherryPie, apricot], next: null },
      });
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
