import { createHash, randomUUID } from "node:crypto";
import { expect, test } from "vite-plus/test";
import type {
  CollectionDescription,
  ContentDocument,
  Permission,
  PublishedCollection,
  Result,
} from "@aircastle/contracts";
import {
  createService,
  type Access,
  type ContentService,
  type ContentStore,
  type ErrorSummary,
} from "@aircastle/core";
import { postgresAdapter } from "./index.ts";

const permissions: readonly Permission[] = ["content:read", "content:write", "schema:publish"];
const articles: CollectionDescription = {
  fields: {
    title: { type: "text", required: true, nullable: false, unique: false, min: 1 },
    slug: { type: "text", required: true, nullable: false, unique: true },
    summary: { type: "text", required: false, nullable: true, unique: false },
    status: {
      type: "text",
      required: false,
      nullable: false,
      unique: false,
      choices: ["draft", "published"],
      default: "draft",
    },
  },
};

function successful<Value>(result: Result<Value>): Value {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`Expected success, received ${result.error.code}`);
  return result.data;
}

const failOnReport = (summary: ErrorSummary) => {
  throw summary;
};

interface Fixture {
  access: Access;
  store: () => ContentStore;
  cms: () => ContentService;
  reopen: () => Promise<void>;
  provision: (projectName: string) => Promise<Access>;
}

async function withCms(operation: (fixture: Fixture) => Promise<void>) {
  const url = process.env.AIRCASTLE_DATABASE_URL;
  if (!url) throw new Error("Run these tests through vp run db:test");
  const namespace = `test_${randomUUID().replaceAll("-", "")}`;
  let store = postgresAdapter({ url, namespace });
  try {
    await store.initialize();
    const provision = async (projectName: string): Promise<Access> => {
      const apiKey = `ac_${randomUUID()}`;
      const provisioned = await store.provision({
        verifier: createHash("sha256").update(apiKey).digest("hex"),
        permissions,
        key: "reuse",
        workspaceName: "Integration workspace",
        projectName,
      });
      return { project: provisioned.project, apiKey };
    };
    const access = await provision("First");
    await operation({
      access,
      store: () => store,
      cms: () => createService(store, failOnReport),
      provision,
      reopen: async () => {
        await store.close();
        store = postgresAdapter({ url, namespace });
        await store.initialize();
      },
    });
  } finally {
    await store.close();
  }
}

async function publish(
  cms: ContentService,
  access: Access,
  description: CollectionDescription = articles,
  baseline: string | null = null,
  additional: PublishedCollection[] = [],
) {
  return successful(
    await cms.publish(access, {
      baseline,
      collections: [{ name: "articles", description }, ...additional],
    }),
  );
}

function saved(result: Result<ContentDocument>) {
  const document = successful(result);
  expect(document.id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i);
  return document;
}

test("committed defaults and optional presence survive a new adapter instance", async () => {
  await withCms(async (fixture) => {
    const cms = fixture.cms();
    const publication = await publish(cms, fixture.access);
    const contract = publication.contracts.articles!;
    const first = saved(
      await cms.create(fixture.access, "articles", contract, { title: "Hello", slug: "hello" }),
    );
    const second = saved(
      await cms.create(fixture.access, "articles", contract, {
        title: "Nullable",
        slug: "nullable",
        summary: null,
      }),
    );
    expect(first).toEqual({ id: first.id, title: "Hello", slug: "hello", status: "draft" });
    expect(second).toEqual({
      id: second.id,
      title: "Nullable",
      slug: "nullable",
      summary: null,
      status: "draft",
    });
    expect(second.id).not.toBe(first.id);
    await fixture.reopen();
    expect(await fixture.cms().findById(fixture.access, "articles", contract, first.id)).toEqual({
      ok: true,
      data: first,
    });
    expect(await fixture.cms().findById(fixture.access, "articles", contract, second.id)).toEqual({
      ok: true,
      data: second,
    });
  });
});

test("invalid documents leave no row and do not reserve a unique value", async () => {
  await withCms(async (fixture) => {
    const cms = fixture.cms();
    const publication = await publish(cms, fixture.access);
    const contract = publication.contracts.articles!;
    expect(
      await cms.create(fixture.access, "articles", contract, { slug: "reusable" }),
    ).toMatchObject({ ok: false, error: { code: "validation_failed" } });
    const document = saved(
      await cms.create(fixture.access, "articles", contract, { title: "Valid", slug: "reusable" }),
    );
    expect(document.slug).toBe("reusable");
    expect(
      await fixture
        .store()
        .transaction(fixture.access.project, (transaction) => transaction.documents("articles")),
    ).toEqual([document]);
  });
});

test("concurrent creates have one winner for an exact unique value", async () => {
  await withCms(async (fixture) => {
    const cms = fixture.cms();
    const publication = await publish(cms, fixture.access);
    const contract = publication.contracts.articles!;
    const attempts = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        cms.create(fixture.access, "articles", contract, {
          title: `Article ${index}`,
          slug: "one-winner",
        }),
      ),
    );
    expect(attempts.filter((result) => result.ok)).toHaveLength(1);
    expect(attempts.filter((result) => !result.ok)).toHaveLength(11);
    for (const result of attempts.filter((result) => !result.ok))
      expect(result).toEqual({ ok: false, error: { code: "unique_conflict", field: "slug" } });
    expect(
      await fixture
        .store()
        .transaction(fixture.access.project, (transaction) => transaction.documents("articles")),
    ).toHaveLength(1);
  });
});

test("missing and null unique fields may repeat while empty text conflicts", async () => {
  await withCms(async (fixture) => {
    const cms = fixture.cms();
    const description = {
      fields: {
        ...articles.fields,
        slug: { type: "text" as const, required: false, nullable: true, unique: true },
      },
    };
    const publication = await publish(cms, fixture.access, description);
    const contract = publication.contracts.articles!;
    for (const input of [
      { title: "Absent 1" },
      { title: "Absent 2" },
      { title: "Null 1", slug: null },
      { title: "Null 2", slug: null },
    ]) {
      expect(saved(await cms.create(fixture.access, "articles", contract, input))).toMatchObject(
        input,
      );
    }
    saved(await cms.create(fixture.access, "articles", contract, { title: "Empty", slug: "" }));
    expect(
      await cms.create(fixture.access, "articles", contract, {
        title: "Duplicate empty",
        slug: "",
      }),
    ).toEqual({ ok: false, error: { code: "unique_conflict", field: "slug" } });
  });
});

test("unique text preserves case, normalization spelling and large valid values", async () => {
  await withCms(async (fixture) => {
    const cms = fixture.cms();
    const publication = await publish(cms, fixture.access);
    const contract = publication.contracts.articles!;
    const entropy = Array.from({ length: 256 }, (_, index) =>
      createHash("sha256").update(`value-${index}`).digest("hex"),
    ).join("");
    const values = ["Case", "case", "é", "e\u0301", "x".repeat(128_000), entropy];
    for (const [index, slug] of values.entries()) {
      const document = saved(
        await cms.create(fixture.access, "articles", contract, { title: `Value ${index}`, slug }),
      );
      expect(document.slug).toBe(slug);
    }
    expect(
      await cms.create(fixture.access, "articles", contract, {
        title: "Same bytes",
        slug: "e\u0301",
      }),
    ).toEqual({ ok: false, error: { code: "unique_conflict", field: "slug" } });
  });
});

test("equal collection names and unique values remain isolated within one instance", async () => {
  await withCms(async (fixture) => {
    const cms = fixture.cms();
    const second = await fixture.provision("Second");
    const firstPublication = await publish(cms, fixture.access, articles, null, [
      { name: "pages", description: articles },
    ]);
    const secondDescription = {
      fields: {
        body: { type: "text" as const, required: true, nullable: false, unique: false },
        slug: articles.fields.slug!,
      },
    };
    const secondPublication = await publish(cms, second, secondDescription);
    const first = saved(
      await cms.create(fixture.access, "articles", firstPublication.contracts.articles!, {
        title: "First",
        slug: "shared",
      }),
    );
    const page = saved(
      await cms.create(fixture.access, "pages", firstPublication.contracts.pages!, {
        title: "Page",
        slug: "shared",
      }),
    );
    const other = saved(
      await cms.create(second, "articles", secondPublication.contracts.articles!, {
        body: "Second",
        slug: "shared",
      }),
    );
    expect(other).toEqual({ id: other.id, body: "Second", slug: "shared" });
    expect(
      await cms.findById(
        fixture.access,
        "articles",
        firstPublication.contracts.articles!,
        other.id,
      ),
    ).toEqual({ ok: false, error: { code: "not_found" } });
    expect(
      await cms.findById(fixture.access, "pages", firstPublication.contracts.pages!, first.id),
    ).toEqual({ ok: false, error: { code: "not_found" } });
    expect(
      await cms.findById(second, "articles", secondPublication.contracts.articles!, page.id),
    ).toEqual({ ok: false, error: { code: "not_found" } });
    expect(
      await cms.findById(
        { project: second.project, apiKey: fixture.access.apiKey },
        "articles",
        secondPublication.contracts.articles!,
        other.id,
      ),
    ).toEqual({ ok: false, error: { code: "forbidden" } });
  });
});

test("competing different publishers from one baseline cannot both activate", async () => {
  await withCms(async (fixture) => {
    const cms = fixture.cms();
    const initial = await publish(cms, fixture.access);
    const left = {
      fields: {
        ...articles.fields,
        left: { type: "text" as const, required: false, nullable: false, unique: false },
      },
    };
    const right = {
      fields: {
        ...articles.fields,
        right: { type: "text" as const, required: false, nullable: false, unique: false },
      },
    };
    const results = await Promise.all([
      cms.publish(fixture.access, {
        baseline: initial.revision,
        collections: [{ name: "articles", description: left }],
      }),
      cms.publish(fixture.access, {
        baseline: initial.revision,
        collections: [{ name: "articles", description: right }],
      }),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([
      { ok: false, error: { code: "schema_conflict" } },
    ]);
    const winner = results.find((result) => result.ok);
    if (!winner?.ok) throw new Error("Expected a winning publisher");
    const active = successful(await cms.schema(fixture.access));
    expect(active.revision).toBe(winner.data.revision);
    expect(active.collections).toEqual([
      { name: "articles", description: results[0]?.ok ? left : right },
    ]);
  });
});

test("failed backfill publication preserves all collections and current content", async () => {
  await withCms(async (fixture) => {
    const cms = fixture.cms();
    const initial = await publish(cms, fixture.access);
    const existing = saved(
      await cms.create(fixture.access, "articles", initial.contracts.articles!, {
        title: "Hello",
        slug: "hello",
      }),
    );
    const changed = {
      fields: {
        ...articles.fields,
        category: {
          type: "text" as const,
          required: false,
          nullable: false,
          unique: false,
          default: "news",
        },
      },
    };
    expect(
      await cms.publish(fixture.access, {
        baseline: initial.revision,
        collections: [
          { name: "articles", description: changed },
          { name: "pages", description: articles },
        ],
      }),
    ).toEqual({ ok: false, error: { code: "migration_required" } });
    expect(await cms.schema(fixture.access)).toEqual({
      ok: true,
      data: {
        revision: initial.revision,
        collections: [{ name: "articles", description: articles }],
      },
    });
    expect(
      await cms.findById(fixture.access, "articles", initial.contracts.articles!, existing.id),
    ).toEqual({ ok: true, data: existing });
    expect(
      await cms.create(fixture.access, "pages", initial.contracts.articles!, {
        title: "Not activated",
        slug: "page",
      }),
    ).toEqual({ ok: false, error: { code: "not_found" } });
  });
});

test("introducing uniqueness over duplicate existing values requires migration", async () => {
  await withCms(async (fixture) => {
    const cms = fixture.cms();
    const loose = {
      fields: { ...articles.fields, slug: { ...articles.fields.slug!, unique: false } },
    };
    const initial = await publish(cms, fixture.access, loose);
    saved(
      await cms.create(fixture.access, "articles", initial.contracts.articles!, {
        title: "First",
        slug: "duplicate",
      }),
    );
    saved(
      await cms.create(fixture.access, "articles", initial.contracts.articles!, {
        title: "Second",
        slug: "duplicate",
      }),
    );
    expect(
      await cms.publish(fixture.access, {
        baseline: initial.revision,
        collections: [{ name: "articles", description: articles }],
      }),
    ).toEqual({ ok: false, error: { code: "migration_required" } });
    expect(successful(await cms.schema(fixture.access)).revision).toBe(initial.revision);
  });
});

test("tightening publication and a concurrent old-client write leave a valid committed state", async () => {
  await withCms(async (fixture) => {
    const cms = fixture.cms();
    const initial = await publish(cms, fixture.access);
    const strict = { fields: { ...articles.fields, title: { ...articles.fields.title!, min: 5 } } };
    const [created, published] = await Promise.all([
      cms.create(fixture.access, "articles", initial.contracts.articles!, {
        title: "tiny",
        slug: "racing",
      }),
      cms.publish(fixture.access, {
        baseline: initial.revision,
        collections: [{ name: "articles", description: strict }],
      }),
    ]);
    const active = successful(await cms.schema(fixture.access));
    const documents = await fixture
      .store()
      .transaction(fixture.access.project, (transaction) => transaction.documents("articles"));
    if (published.ok) {
      expect(active.collections).toEqual([{ name: "articles", description: strict }]);
      expect(
        documents.every(
          (document) =>
            document.title !== undefined && document.title !== null && document.title.length >= 5,
        ),
      ).toBe(true);
      expect(created).toMatchObject({
        ok: false,
        error: { code: expect.stringMatching(/^(schema_mismatch|unavailable)$/) },
      });
    } else if (created.ok) {
      expect(published).toMatchObject({
        ok: false,
        error: { code: expect.stringMatching(/^(migration_required|unavailable)$/) },
      });
      expect(active.revision).toBe(initial.revision);
      expect(documents).toEqual([created.data]);
    } else {
      expect(created).toEqual({ ok: false, error: { code: "unavailable" } });
      expect(published).toEqual({ ok: false, error: { code: "unavailable" } });
      expect(active.revision).toBe(initial.revision);
      expect(documents).toEqual([]);
    }
  });
});

test("historical contracts remain usable for compatible projected reads after schema publication", async () => {
  await withCms(async (fixture) => {
    const cms = fixture.cms();
    const initial = await publish(cms, fixture.access);
    const existing = saved(
      await cms.create(fixture.access, "articles", initial.contracts.articles!, {
        title: "Hello",
        slug: "hello",
      }),
    );
    const changed = {
      fields: {
        ...articles.fields,
        teaser: { type: "text" as const, required: false, nullable: false, unique: false },
      },
    };
    const updated = await publish(cms, fixture.access, changed, initial.revision);
    const newer = saved(
      await cms.create(fixture.access, "articles", updated.contracts.articles!, {
        title: "Newer",
        slug: "newer",
        teaser: "Only new clients",
      }),
    );
    await fixture.reopen();
    expect(
      await fixture
        .cms()
        .findById(fixture.access, "articles", initial.contracts.articles!, newer.id),
    ).toEqual({
      ok: true,
      data: { id: newer.id, title: "Newer", slug: "newer", status: "draft" },
    });
    expect(
      await fixture
        .cms()
        .findById(fixture.access, "articles", updated.contracts.articles!, existing.id),
    ).toEqual({ ok: true, data: existing });
  });
});

test("defaults are applied before enforcing unique values", async () => {
  await withCms(async (fixture) => {
    const cms = fixture.cms();
    const description = {
      fields: {
        ...articles.fields,
        slug: { ...articles.fields.slug!, required: false, default: "automatic" },
      },
    };
    const initial = await publish(cms, fixture.access, description);
    expect(
      saved(
        await cms.create(fixture.access, "articles", initial.contracts.articles!, {
          title: "First",
        }),
      ).slug,
    ).toBe("automatic");
    expect(
      await cms.create(fixture.access, "articles", initial.contracts.articles!, {
        title: "Second",
      }),
    ).toEqual({ ok: false, error: { code: "unique_conflict", field: "slug" } });
  });
});

test("adding uniqueness indexes existing values before activating the new schema", async () => {
  await withCms(async (fixture) => {
    const cms = fixture.cms();
    const loose = {
      fields: { ...articles.fields, slug: { ...articles.fields.slug!, unique: false } },
    };
    const initial = await publish(cms, fixture.access, loose);
    saved(
      await cms.create(fixture.access, "articles", initial.contracts.articles!, {
        title: "First",
        slug: "taken",
      }),
    );
    const updated = await publish(cms, fixture.access, articles, initial.revision);
    expect(
      await cms.create(fixture.access, "articles", updated.contracts.articles!, {
        title: "Second",
        slug: "taken",
      }),
    ).toEqual({ ok: false, error: { code: "unique_conflict", field: "slug" } });
  });
});

test("a failed multi-unique insert rolls back other claimed values", async () => {
  await withCms(async (fixture) => {
    const cms = fixture.cms();
    const description = {
      fields: { ...articles.fields, title: { ...articles.fields.title!, unique: true } },
    };
    const initial = await publish(cms, fixture.access, description);
    const contract = initial.contracts.articles!;
    saved(
      await cms.create(fixture.access, "articles", contract, { title: "Taken", slug: "original" }),
    );
    expect(
      await cms.create(fixture.access, "articles", contract, {
        title: "Reusable",
        slug: "original",
      }),
    ).toEqual({ ok: false, error: { code: "unique_conflict", field: "slug" } });
    expect(
      saved(
        await cms.create(fixture.access, "articles", contract, { title: "Reusable", slug: "next" }),
      ).title,
    ).toBe("Reusable");
    expect(
      await fixture
        .store()
        .transaction(fixture.access.project, (transaction) => transaction.documents("articles")),
    ).toHaveLength(2);
  });
});

test("every configured unique field is enforced without requiring a fixed conflict order", async () => {
  await withCms(async (fixture) => {
    const cms = fixture.cms();
    const description = {
      fields: { ...articles.fields, title: { ...articles.fields.title!, unique: true } },
    };
    const initial = await publish(cms, fixture.access, description);
    const contract = initial.contracts.articles!;
    saved(
      await cms.create(fixture.access, "articles", contract, { title: "Taken", slug: "original" }),
    );
    expect(
      await cms.create(fixture.access, "articles", contract, { title: "Taken", slug: "new-slug" }),
    ).toEqual({ ok: false, error: { code: "unique_conflict", field: "title" } });
    expect(
      await cms.create(fixture.access, "articles", contract, { title: "Other", slug: "original" }),
    ).toEqual({ ok: false, error: { code: "unique_conflict", field: "slug" } });
    const both = await cms.create(fixture.access, "articles", contract, {
      title: "Taken",
      slug: "original",
    });
    expect(both).toMatchObject({ ok: false, error: { code: "unique_conflict" } });
    if (both.ok || both.error.code !== "unique_conflict")
      throw new Error("Expected a detected unique conflict");
    expect(["title", "slug"]).toContain(both.error.field);
    expect(
      await fixture
        .store()
        .transaction(fixture.access.project, (transaction) => transaction.documents("articles")),
    ).toHaveLength(1);
  });
});

test("valid long collection and unique field names do not inherit SQL index byte limits", async () => {
  await withCms(async (fixture) => {
    const entropy = (seed: string) =>
      Array.from({ length: 96 }, (_, index) =>
        createHash("sha256").update(`${seed}-${index}`).digest("hex"),
      ).join("");
    const collectionName = "collection_" + entropy("collection");
    const fieldName = "field_" + entropy("field");
    const definition: CollectionDescription = {
      fields: { [fieldName]: { type: "text", required: true, nullable: false, unique: true } },
    };
    const cms = fixture.cms();
    const publication = successful(
      await cms.publish(fixture.access, {
        baseline: null,
        collections: [{ name: collectionName, description: definition }],
      }),
    );
    const contract = publication.contracts[collectionName]!;
    const document = saved(
      await cms.create(fixture.access, collectionName, contract, { [fieldName]: "kept" }),
    );
    expect(document).toEqual({ id: expect.any(String), [fieldName]: "kept" });
    expect(await cms.findById(fixture.access, collectionName, contract, document.id)).toEqual({
      ok: true,
      data: document,
    });
    expect(
      await cms.create(fixture.access, collectionName, contract, { [fieldName]: "kept" }),
    ).toEqual({ ok: false, error: { code: "unique_conflict", field: fieldName } });
  });
});
