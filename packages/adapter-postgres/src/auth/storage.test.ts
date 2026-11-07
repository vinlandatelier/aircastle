import { createHash } from "node:crypto";
import { expect, test } from "vite-plus/test";
import postgres from "postgres";
import { AuthStorageError } from "@aircastle/core";
import { postgresAdapter, postgresAuthAdmission, postgresAuthStore } from "../index.ts";
import { withDatabase } from "../test-support/database.ts";

async function withStore(
  run: (
    fixture: Parameters<Parameters<typeof withDatabase>[0]>[0] & {
      auth: Awaited<ReturnType<typeof postgresAuthStore>>;
    },
  ) => Promise<void>,
) {
  await withDatabase(async (fixture) => {
    await fixture.store.initialize();
    const auth = await postgresAuthStore({ url: fixture.url, namespace: fixture.namespace });
    try {
      await run({ ...fixture, auth });
    } finally {
      await auth.close();
    }
  });
}

test("auth initialization adds its own ledger while preserving content version 1", async () => {
  await withStore(async ({ auth, sql, namespace, store }) => {
    const tables = await sql<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables WHERE table_schema = ${namespace}`;
    expect(tables.map((table) => table.table_name)).toContain("auth_migrations");
    expect(await sql`SELECT version FROM ${sql(namespace)}.migrations ORDER BY version`).toEqual([
      { version: 1 },
    ]);
    await store.initialize();
    expect(await auth.signingSecret()).toMatch(/^.{32,}$/u);
  });
});

test("auth can initialize first and content can initialize afterwards", async () => {
  await withDatabase(async ({ url, namespace, store, sql }) => {
    const auth = await postgresAuthStore({ url, namespace });
    try {
      const rows = await sql<
        { exists: boolean }[]
      >`SELECT to_regnamespace(${namespace}) IS NOT NULL AS exists`;
      expect(rows[0]?.exists).toBe(true);
      await store.initialize();
      expect(await sql`SELECT version FROM ${sql(namespace)}.migrations`).toEqual([{ version: 1 }]);
      expect(await auth.signingSecret()).toMatch(/^.{32,}$/u);
    } finally {
      await auth.close();
    }
  });
});

test("repeat and concurrent initialization retain one signing secret", async () => {
  await withStore(async ({ url, namespace, auth }) => {
    const secret = await auth.signingSecret();
    expect(secret.length).toBeGreaterThanOrEqual(32);
    const others = await Promise.all(
      Array.from({ length: 4 }, () => postgresAuthStore({ url, namespace })),
    );
    try {
      expect(await Promise.all(others.map((store) => store.signingSecret()))).toEqual(
        Array(4).fill(secret),
      );
    } finally {
      await Promise.all(others.map((store) => store.close()));
    }
  });
});

test("signing material persists across closing and reopening storage", async () => {
  await withStore(async ({ auth, url, namespace }) => {
    const secret = await auth.signingSecret();
    expect(secret.length).toBeGreaterThanOrEqual(32);
    await auth.close();
    const reopened = await postgresAuthStore({ url, namespace });
    try {
      expect(await reopened.signingSecret()).toBe(secret);
    } finally {
      await reopened.close();
    }
  });
});

test("different namespaces never share signing material", async () => {
  await withStore(async ({ auth }) => {
    await withStore(async ({ auth: other }) => {
      const secret = await auth.signingSecret();
      expect(secret).not.toBe(await other.signingSecret());
    });
  });
});

test("a version 1 auth namespace gains request admission storage on upgrade", async () => {
  await withDatabase(async ({ store, sql, namespace, url }) => {
    await store.initialize();
    await (await postgresAuthStore({ url, namespace })).close();
    await sql`DROP TABLE ${sql(namespace)}.auth_admission_events`;
    await sql`DROP TABLE ${sql(namespace)}.auth_admission_policy`;
    await sql`DELETE FROM ${sql(namespace)}.auth_migrations WHERE version = 2`;
    const admission = await postgresAuthAdmission({
      url,
      namespace,
      limits: {
        email: { fiveMinutes: 5, oneHour: 20 },
        ip: { fiveMinutes: 10, oneHour: 30 },
        global: { fiveMinutes: 30, oneHour: 100 },
      },
    });
    try {
      expect(await admission.admit({ source: "127.0.0.1" })).toEqual({ kind: "admitted" });
    } finally {
      await admission.close();
    }
    expect(
      await sql`SELECT version FROM ${sql(namespace)}.auth_migrations ORDER BY version`,
    ).toEqual([{ version: 1 }, { version: 2 }]);
  });
});

test("auth refuses unknown future auth migration versions", async () => {
  await withDatabase(async ({ store, sql, namespace, url }) => {
    await store.initialize();
    await sql`CREATE TABLE ${sql(namespace)}.auth_migrations (version integer PRIMARY KEY)`;
    await sql`INSERT INTO ${sql(namespace)}.auth_migrations VALUES (999)`;
    let opened: Awaited<ReturnType<typeof postgresAuthStore>> | undefined;
    try {
      await expect(
        (async () => {
          opened = await postgresAuthStore({ url, namespace });
        })(),
      ).rejects.toBeInstanceOf(Error);
      expect(await sql`SELECT version FROM ${sql(namespace)}.auth_migrations`).toEqual([
        { version: 999 },
      ]);
    } finally {
      await opened?.close();
    }
  });
});

test("auth refuses to adopt a foreign populated namespace", async () => {
  await withDatabase(async ({ sql, namespace, url }) => {
    await sql`CREATE SCHEMA ${sql(namespace)}`;
    await sql`CREATE TABLE ${sql(namespace)}.foreign_data (value text)`;
    await sql`INSERT INTO ${sql(namespace)}.foreign_data VALUES ('keep')`;
    let opened: Awaited<ReturnType<typeof postgresAuthStore>> | undefined;
    try {
      await expect(
        (async () => {
          opened = await postgresAuthStore({ url, namespace });
        })(),
      ).rejects.toBeInstanceOf(Error);
      expect(await sql`SELECT value FROM ${sql(namespace)}.foreign_data`).toEqual([
        { value: "keep" },
      ]);
    } finally {
      await opened?.close();
    }
  });
});

test("auth initialization preserves existing content, contracts and API-key permissions", async () => {
  await withDatabase(async ({ url, namespace, store }) => {
    await store.initialize();
    const verifier = createHash("sha256").update("content-fixture-key").digest("hex");
    const project = await store.provision({
      verifier,
      permissions: ["content:read"],
      key: "reuse",
      workspaceName: "Development workspace",
      projectName: "Development project",
    });
    const description = {
      fields: { title: { type: "text" as const, required: true, nullable: false, unique: false } },
    };
    const contract = `v1:${"1".repeat(64)}`;
    await store.transaction(project.project, (tx) =>
      tx.activate([{ name: "articles", description }], {
        revision: "before-auth",
        contracts: { articles: contract },
      }),
    );
    const saved = await store.transaction(project.project, (tx) =>
      tx.insert("articles", { title: "old content" }, []),
    );
    expect(saved.ok).toBe(true);
    if (!saved.ok) throw new Error("Content control must persist before auth initialization");
    const auth = await postgresAuthStore({ url, namespace });
    const reopened = postgresAdapter({ url, namespace });
    try {
      await reopened.initialize();
      expect(
        await reopened.transaction(project.project, (tx) => tx.read("articles", saved.data.id)),
      ).toEqual({ id: saved.data.id, title: "old content" });
      expect(await reopened.transaction(project.project, (tx) => tx.contract(contract))).toEqual(
        description,
      );
      expect(await reopened.authorize(project.project, verifier, "content:read")).toBe(
        "authorized",
      );
      expect(await reopened.authorize(project.project, verifier, "content:write")).toBe(
        "forbidden",
      );
      expect((await reopened.transaction(project.project, (tx) => tx.state())).revision).toBe(
        "before-auth",
      );
      expect(await auth.signingSecret()).toMatch(/^.{32,}$/u);
    } finally {
      await auth.close();
      await reopened.close();
    }
  });
});

test("auth users and sessions keep only the columns Aircastle reads", async () => {
  await withStore(async ({ sql, namespace }) => {
    const columns = async (table: string) =>
      (
        await sql<{ column_name: string }[]>`
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = ${namespace} AND table_name = ${table} ORDER BY ordinal_position`
      ).map((row) => row.column_name);
    expect(await columns("auth_users")).toEqual([
      "id",
      "name",
      "email",
      "created_at",
      "updated_at",
      "onboarding_offered",
      "last_workspace_id",
    ]);
    expect(await columns("auth_sessions")).toEqual([
      "id",
      "user_id",
      "token_digest",
      "expires_at",
      "created_at",
      "updated_at",
    ]);
  });
});

test("a session is stored and found by its token digest", async () => {
  await withStore(async ({ auth }) => {
    const user = {
      id: "user-1",
      name: "Alex",
      email: "alex@example.test",
      createdAt: 1,
      updatedAt: 1,
    };
    const session = {
      id: "session-1",
      userId: user.id,
      tokenDigest: createHash("sha256").update("bearer").digest("hex"),
      expiresAt: 10,
      createdAt: 1,
      updatedAt: 1,
    };
    await auth.transaction(async (tx) => {
      expect(await tx.insertUser(user)).toEqual(user);
      expect(await tx.insertSession(session)).toEqual(session);
    });
    expect(await auth.transaction((tx) => tx.session(session.tokenDigest))).toEqual(session);
    expect(await auth.transaction((tx) => tx.session("bearer"))).toBeNull();
  });
});

test("reading setup state does not wait for a held setup claim lock", async () => {
  await withStore(async ({ auth }) => {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked: () => void = () => {};
    const lockTaken = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const claim = auth.transaction(async (tx) => {
      expect(await tx.lockSetupClaim()).toBe("open");
      locked();
      await held;
    });
    try {
      await lockTaken;
      const read = auth.transaction((tx) => tx.setupState());
      const outcome = await Promise.race([
        read,
        new Promise((resolve) => setTimeout(() => resolve("blocked"), 2_000)),
      ]);
      expect(outcome).toBe("open");
    } finally {
      release();
      await claim;
    }
  });
});

test("a driver failure keeps its cause and SQLSTATE without its message", async () => {
  await withStore(async ({ auth }) => {
    const user = {
      id: "user-1",
      name: "Alex",
      email: "alex@example.test",
      createdAt: 1,
      updatedAt: 1,
    };
    await auth.transaction((tx) => tx.insertUser(user));
    const failure = await auth
      .transaction((tx) => tx.insertUser({ ...user, id: "user-2" }))
      .then(
        () => undefined,
        (error: unknown) => error,
      );
    expect(failure).toBeInstanceOf(AuthStorageError);
    if (!(failure instanceof AuthStorageError)) throw new Error("Expected a storage failure");
    expect(failure.kind).toBe("unavailable");
    expect(failure.code).toBe("23505");
    expect(failure.message).toBe("unavailable");
    expect(failure.cause).toBeInstanceOf(postgres.PostgresError);
  });
});

test.each([
  ["a TypeError", () => Promise.reject(new TypeError("callback bug")), { name: "TypeError" }],
  [
    "a Node TypeError with an ERR_ code",
    async () => {
      createHash("sha256").update(JSON.parse("null"));
    },
    { name: "TypeError", code: "ERR_INVALID_ARG_TYPE" },
  ],
  [
    "an Error with an arbitrary code",
    () => Promise.reject(Object.assign(new Error("callback bug"), { code: "ANY_CODE" })),
    { code: "ANY_CODE" },
  ],
  [
    "an AggregateError that holds a TypeError",
    () =>
      Promise.reject(
        new AggregateError([
          Object.assign(new Error("connect ECONNREFUSED"), {
            code: "ECONNREFUSED",
            syscall: "connect",
          }),
          new TypeError("callback bug"),
        ]),
      ),
    { name: "AggregateError" },
  ],
  [
    "an empty AggregateError",
    () => Promise.reject(new AggregateError([])),
    { name: "AggregateError" },
  ],
] as const)(
  "%s inside a transaction is not reported as a storage failure",
  async (_, fault, raised) => {
    await withStore(async ({ auth }) => {
      const failure = await auth.transaction(fault).then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(failure).not.toBeInstanceOf(AuthStorageError);
      expect(failure).toMatchObject(raised);
    });
  },
);

test.each([
  [
    "refused",
    () => postgres("postgres://aircastle@127.0.0.1:1/aircastle", { max: 1, connect_timeout: 2 }),
    "ECONNREFUSED",
  ],
  [
    "refused localhost",
    () => postgres("postgres://aircastle@localhost:1/aircastle", { max: 1, connect_timeout: 2 }),
    "ECONNREFUSED",
  ],
  [
    "ended",
    async () => {
      const client = postgres("postgres://aircastle@127.0.0.1:1/aircastle", { max: 1 });
      await client.end({ timeout: 0 });
      return client;
    },
    "CONNECTION_ENDED",
  ],
] as const)(
  "a %s postgres.js connection is reported as unavailable with its code",
  async (_, connect, code) => {
    await withStore(async ({ auth }) => {
      const client = await connect();
      try {
        const failure = await auth
          .transaction(async () => {
            await client`SELECT 1`;
          })
          .then(
            () => undefined,
            (error: unknown) => error,
          );
        expect(failure).toBeInstanceOf(AuthStorageError);
        expect(failure).toMatchObject({ kind: "unavailable", code, message: "unavailable" });
      } finally {
        await client.end({ timeout: 0 });
      }
    });
  },
);
