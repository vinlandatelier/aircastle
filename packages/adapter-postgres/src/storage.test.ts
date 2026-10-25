import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { expect, test } from "vite-plus/test";
import postgres from "postgres";
import { StorageUnavailable } from "@aircastle/core";
import { postgresAdapter } from "./index.ts";
import {
  databaseUrl,
  development,
  literalIdentifier,
  withDatabase,
} from "./test-support/database.ts";
import type { Permission, PublishedCollection } from "@aircastle/contracts";

const permissions: readonly Permission[] = ["content:read", "content:write", "schema:publish"];
const secret = "ac_storage_fixture_secret_never_persist";
const verifier = createHash("sha256").update(secret).digest("hex");
const description = {
  fields: { title: { type: "text" as const, required: true, nullable: false, unique: true } },
};
const collections: PublishedCollection[] = [{ name: "articles", description }];
const contract = `v1:${"1".repeat(64)}`;

test("database control reaches pinned Postgres and preserves UTF-8 values", async () => {
  await withDatabase(async ({ sql }) => {
    const rows = await sql<
      { version: string; value: string }[]
    >`SELECT current_setting('server_version') AS version, ${"e\u0301🙂"}::text AS value`;
    expect(rows[0]?.version).toMatch(/^18\.6\b/);
    expect(rows[0]?.value).toBe("e\u0301🙂");
  });
});

test("an unreachable database surfaces as StorageUnavailable", async () => {
  const server = createServer();
  const port = await new Promise<number>((resolve) =>
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(typeof address === "object" && address !== null ? address.port : 0);
    }),
  );
  await new Promise((resolve) => server.close(resolve));
  const store = postgresAdapter({ url: `postgres://aircastle@127.0.0.1:${port}/aircastle` });
  try {
    await expect(store.initialize()).rejects.toBeInstanceOf(StorageUnavailable);
  } finally {
    await store.close();
  }
});

test("initialization creates an owned namespace and is repeatable", async () => {
  await withDatabase(async ({ sql, store, namespace }) => {
    await store.initialize();
    await store.initialize();
    const rows = await sql<
      { exists: boolean }[]
    >`SELECT to_regnamespace(${namespace}) IS NOT NULL AS exists`;
    expect(rows[0]?.exists).toBe(true);
    const tables = await sql<
      { table_name: string }[]
    >`SELECT table_name FROM information_schema.tables WHERE table_schema = ${namespace}`;
    expect(tables.length).toBeGreaterThan(0);
  });
});

for (const populated of [false, true]) {
  test(`initialization refuses a foreign ${populated ? "populated" : "empty"} namespace without adoption`, async () => {
    await withDatabase(async ({ sql, store, namespace }) => {
      await sql`CREATE SCHEMA ${sql(namespace)}`;
      if (populated) {
        await sql`CREATE TABLE ${sql(namespace)}.foreign_data (value text NOT NULL)`;
        await sql`INSERT INTO ${sql(namespace)}.foreign_data VALUES ('preserve-me')`;
      }
      await expect(store.initialize()).rejects.toBeInstanceOf(Error);
      const tables = await sql<
        { table_name: string }[]
      >`SELECT table_name FROM information_schema.tables WHERE table_schema = ${namespace}`;
      expect(tables.map((row) => row.table_name)).toEqual(populated ? ["foreign_data"] : []);
      if (populated)
        expect(
          (await sql`SELECT value FROM ${sql(namespace)}.foreign_data`).map((row) => row.value),
        ).toEqual(["preserve-me"]);
    });
  });
}

test("concurrent initializers converge on one owned development identity", async () => {
  await withDatabase(async ({ store, namespace, url }) => {
    const other = postgresAdapter({ url, namespace });
    try {
      await Promise.all([store.initialize(), other.initialize()]);
      const projects = await Promise.all([
        store.provision({ verifier, permissions, key: "reuse", ...development }),
        other.provision({ verifier, permissions, key: "reuse", ...development }),
      ]);
      expect(projects[0]?.workspace).toBe(projects[1]?.workspace);
      expect(projects[0]?.project).toBe(projects[1]?.project);
      expect(projects.filter((project) => project.issued)).toHaveLength(1);
      expect(projects[0]?.project).toMatch(
        /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,
      );
    } finally {
      await other.close();
    }
  });
});

test("key permissions and stored project binding control access", async () => {
  await withDatabase(async ({ store }) => {
    await store.initialize();
    const project = await store.provision({
      verifier,
      permissions: ["content:read"],
      key: "reuse",
      ...development,
    });
    expect(await store.authorize(project.project, verifier, "content:read")).toBe("authorized");
    expect(await store.authorize(project.project, verifier, "content:write")).toBe("forbidden");
    expect(await store.authorize(project.project, verifier, "schema:publish")).toBe("forbidden");
    expect(await store.authorize(randomUUID(), verifier, "content:read")).toBe("forbidden");
    expect(await store.authorize(project.project, "unknown-verifier", "content:read")).toBe(
      "unauthorized",
    );
  });
});

test("development identity reuse preserves keys and an explicit new key keeps the old key valid", async () => {
  await withDatabase(async ({ store }) => {
    await store.initialize();
    const first = await store.provision({ verifier, permissions, key: "reuse", ...development });
    const secondVerifier = createHash("sha256").update("second-secret").digest("hex");
    const repeated = await store.provision({
      verifier: secondVerifier,
      permissions,
      key: "reuse",
      ...development,
    });
    expect(repeated).toEqual({ workspace: first.workspace, project: first.project, issued: false });
    expect(await store.authorize(first.project, verifier, "content:read")).toBe("authorized");
    expect(await store.authorize(first.project, secondVerifier, "content:read")).toBe(
      "unauthorized",
    );
    const issued = await store.provision({
      verifier: secondVerifier,
      permissions,
      key: "issue",
      ...development,
    });
    expect(issued).toEqual({ workspace: first.workspace, project: first.project, issued: true });
    expect(await store.authorize(first.project, verifier, "content:read")).toBe("authorized");
    expect(await store.authorize(first.project, secondVerifier, "content:read")).toBe("authorized");
  });
});

test("two projects in one namespace persist independent collections and documents", async () => {
  await withDatabase(async ({ store }) => {
    await store.initialize();
    const first = await store.provision({
      verifier,
      permissions,
      key: "reuse",
      workspaceName: "Shared",
      projectName: "First",
    });
    const secondVerifier = createHash("sha256").update("other-project-key").digest("hex");
    const second = await store.provision({
      verifier: secondVerifier,
      permissions,
      key: "reuse",
      workspaceName: "Shared",
      projectName: "Second",
    });
    expect(second.workspace).toBe(first.workspace);
    expect(second.project).not.toBe(first.project);
    const otherCollections: PublishedCollection[] = [
      {
        name: "articles",
        description: {
          fields: { body: { type: "text", required: true, nullable: false, unique: false } },
        },
      },
    ];
    await store.transaction(first.project, async (transaction) => {
      await transaction.activate(collections, {
        revision: "first-revision",
        contracts: { articles: contract },
      });
    });
    await store.transaction(second.project, async (transaction) => {
      await transaction.activate(otherCollections, {
        revision: "second-revision",
        contracts: { articles: `v1:${"2".repeat(64)}` },
      });
    });
    const saved = await store.transaction(first.project, (transaction) =>
      transaction.insert("articles", { title: "First" }, []),
    );
    expect(saved.ok).toBe(true);
    if (!saved.ok) throw new Error("Expected persisted first-project document");
    const id = saved.data.id;
    expect(
      await store.transaction(second.project, (transaction) => transaction.read("articles", id)),
    ).toBeUndefined();
    expect(await store.transaction(first.project, (transaction) => transaction.state())).toEqual({
      revision: "first-revision",
      collections,
    });
    expect(await store.transaction(second.project, (transaction) => transaction.state())).toEqual({
      revision: "second-revision",
      collections: otherCollections,
    });
  });
});

test("transaction rollback leaves no published state after a thrown operation", async () => {
  await withDatabase(async ({ store }) => {
    await store.initialize();
    const project = await store.provision({ verifier, permissions, key: "reuse", ...development });
    const failure = new Error("abort-publication");
    await expect(
      store.transaction(project.project, async (transaction) => {
        await transaction.activate(collections, {
          revision: "must-rollback",
          contracts: { articles: contract },
        });
        throw failure;
      }),
    ).rejects.toBeInstanceOf(Error);
    expect(await store.transaction(project.project, (transaction) => transaction.state())).toEqual({
      revision: null,
      collections: [],
    });
  });
});

test("direct persistence enforces unique values across concurrent transactions", async () => {
  await withDatabase(async ({ store }) => {
    await store.initialize();
    const project = await store.provision({ verifier, permissions, key: "reuse", ...development });
    await store.transaction(project.project, (transaction) =>
      transaction.activate(collections, { revision: "initial", contracts: { articles: contract } }),
    );
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        store.transaction(project.project, (transaction) =>
          transaction.insert("articles", { title: "same" }, ["title"]),
        ),
      ),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toHaveLength(7);
    for (const result of results.filter((result) => !result.ok))
      expect(result).toEqual({ ok: false, error: { code: "unique_conflict", field: "title" } });
    expect(
      await store.transaction(project.project, (transaction) => transaction.documents("articles")),
    ).toHaveLength(1);
  });
});

test("publication, contract history and document presence survive opening a new adapter", async () => {
  await withDatabase(async ({ store, namespace, url, close }) => {
    await store.initialize();
    const project = await store.provision({ verifier, permissions, key: "reuse", ...development });
    await store.transaction(project.project, (transaction) =>
      transaction.activate(collections, { revision: "kept", contracts: { articles: contract } }),
    );
    const omitted = await store.transaction(project.project, (transaction) =>
      transaction.insert("articles", { title: "omitted" }, []),
    );
    const nullable = await store.transaction(project.project, (transaction) =>
      transaction.insert("articles", { title: "nullable", summary: null }, []),
    );
    expect(omitted.ok).toBe(true);
    expect(nullable.ok).toBe(true);
    if (!omitted.ok || !nullable.ok) throw new Error("Expected persisted fixture documents");
    await close();
    const reopened = postgresAdapter({ url, namespace });
    try {
      await reopened.initialize();
      expect(
        await reopened.transaction(project.project, (transaction) => transaction.state()),
      ).toEqual({ revision: "kept", collections });
      expect(
        await reopened.transaction(project.project, (transaction) =>
          transaction.contract(contract),
        ),
      ).toEqual(description);
      expect(
        await reopened.transaction(project.project, (transaction) =>
          transaction.read("articles", omitted.data.id),
        ),
      ).toEqual({ id: omitted.data.id, title: "omitted" });
      expect(
        await reopened.transaction(project.project, (transaction) =>
          transaction.read("articles", nullable.data.id),
        ),
      ).toEqual({ id: nullable.data.id, title: "nullable", summary: null });
    } finally {
      await reopened.close();
    }
  });
});

test("stored records contain a verifier but never the raw issued secret", async () => {
  await withDatabase(async ({ sql, store, namespace }) => {
    await store.initialize();
    const project = await store.provision({ verifier, permissions, key: "reuse", ...development });
    expect(await store.authorize(project.project, verifier, "schema:publish")).toBe("authorized");
    const tables = await sql<
      { table_name: string }[]
    >`SELECT table_name FROM information_schema.tables WHERE table_schema = ${namespace}`;
    const contents: unknown[] = [];
    for (const table of tables) {
      contents.push(
        await sql`SELECT row_to_json(record)::text AS data FROM ${sql(namespace)}.${sql(table.table_name)} AS record`,
      );
    }
    const serialized = JSON.stringify(contents);
    expect(serialized).toContain(verifier);
    expect(serialized).not.toContain(secret);
  });
});

for (const namespace of [
  "",
  "nul\u0000name",
  "lone\ud800surrogate",
  "x".repeat(64),
  "é".repeat(32),
]) {
  test(`invalid namespace ${JSON.stringify(namespace)} is rejected before schema mutation`, async () => {
    let store: ReturnType<typeof postgresAdapter> | undefined;
    try {
      await expect(
        (async () => {
          store = postgresAdapter({ url: databaseUrl(), namespace });
          await store.initialize();
        })(),
      ).rejects.toBeInstanceOf(Error);
    } finally {
      await store?.close();
    }
  });
}

for (const namespace of ["has-dash", "one.two", "x" + "é".repeat(31)]) {
  test(`single quoted namespace ${JSON.stringify(namespace)} is preserved exactly`, async () => {
    await withDatabase(
      async ({ sql, store }) => {
        await store.initialize();
        const rows = await sql<
          { exists: boolean }[]
        >`SELECT EXISTS (SELECT FROM pg_namespace WHERE nspname = ${namespace}) AS exists`;
        expect(rows[0]?.exists).toBe(true);
      },
      { namespace },
    );
  });
}

test("injection-looking namespace is quoted as one identifier and changes no unrelated object", async () => {
  const namespace = 'evil"; DROP SCHEMA public CASCADE;--';
  await withDatabase(
    async ({ sql, store }) => {
      const unrelated = `unrelated_${randomUUID().replaceAll("-", "")}`;
      const before = await sql<
        { oid: number }[]
      >`SELECT oid FROM pg_namespace WHERE nspname = 'public'`;
      await sql`CREATE SCHEMA ${sql(unrelated)}`;
      try {
        await sql`CREATE TABLE ${sql(unrelated)}.guarded (value text NOT NULL)`;
        await sql`INSERT INTO ${sql(unrelated)}.guarded VALUES ('unchanged')`;
        await store.initialize();
        const literal = await sql<
          { exists: boolean }[]
        >`SELECT EXISTS (SELECT FROM pg_namespace WHERE nspname = ${namespace}) AS exists`;
        expect(literal[0]?.exists).toBe(true);
        expect(await sql`SELECT oid FROM pg_namespace WHERE nspname = 'public'`).toEqual(before);
        expect(
          (await sql`SELECT value FROM ${sql(unrelated)}.guarded`).map((row) => row.value),
        ).toEqual(["unchanged"]);
      } finally {
        await sql`DROP SCHEMA IF EXISTS ${sql(unrelated)} CASCADE`;
      }
    },
    { namespace },
  );
});

for (const [namespace, truncated] of [
  ["x".repeat(64), "x".repeat(63)],
  ["é".repeat(32), "é".repeat(31)],
] as const) {
  test(`overlong namespace does not create its truncated ${Buffer.byteLength(truncated)}-byte spelling`, async () => {
    await withDatabase(async ({ sql, url }) => {
      let invalid: ReturnType<typeof postgresAdapter> | undefined;
      try {
        await expect(
          (async () => {
            invalid = postgresAdapter({ url, namespace });
            await invalid.initialize();
          })(),
        ).rejects.toBeInstanceOf(Error);
        const rows = await sql<
          { exists: boolean }[]
        >`SELECT EXISTS (SELECT FROM pg_namespace WHERE nspname = ${truncated}) AS exists`;
        expect(rows[0]?.exists).toBe(false);
      } finally {
        await invalid?.close();
      }
    });
  });
}

test("database fixture creates and cleans one literal dotted namespace independently of the adapter", async () => {
  const namespace = `fixture.${randomUUID().replaceAll("-", "")}`;
  const inspector = postgres(databaseUrl(), { onnotice: () => {} });
  try {
    await withDatabase(
      async ({ sql }) => {
        await sql`CREATE SCHEMA ${literalIdentifier(sql, namespace)}`;
        const rows = await sql<
          { exists: boolean }[]
        >`SELECT EXISTS (SELECT FROM pg_namespace WHERE nspname = ${namespace}) AS exists`;
        expect(rows[0]?.exists).toBe(true);
      },
      { namespace },
    );
    const rows = await inspector<
      { exists: boolean }[]
    >`SELECT EXISTS (SELECT FROM pg_namespace WHERE nspname = ${namespace}) AS exists`;
    expect(rows[0]?.exists).toBe(false);
  } finally {
    await inspector.end();
  }
});
