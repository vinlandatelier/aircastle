import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, test } from "vite-plus/test";
import {
  blocks,
  boolean,
  collection,
  date,
  datetime,
  json,
  list,
  number,
  object,
  point,
  reference,
  text,
  type CollectionDefinitions,
} from "@aircastle/schema";
import { createClient, defineConfig, type AircastleClient } from "@aircastle/client";
import {
  describeCollections,
  projectDocument,
  validateStored,
  type Permission,
} from "@aircastle/contracts";
import { postgresAdapter } from "@aircastle/adapter-postgres";
import type { ContentStore } from "@aircastle/core";
import { processDeadlines, standaloneServer } from "./support/content-processes.ts";

const permissions: readonly Permission[] = ["content:read", "content:write", "schema:publish"];
const lowercaseUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const generated = expect.stringMatching(lowercaseUuid);
const fileBudget = processDeadlines.start + processDeadlines.stop + processDeadlines.kill + 30_000;

let store: ContentStore;
let server: Awaited<ReturnType<typeof standaloneServer>>;

beforeAll(async () => {
  const namespace = `fieldtypes_${randomUUID().replaceAll("-", "")}`;
  store = postgresAdapter({ url: process.env.DATABASE_URL ?? "", namespace });
  await store.initialize();
  server = await standaloneServer(namespace);
}, fileBudget);

afterAll(async () => {
  try {
    await server?.close();
  } finally {
    await store?.close();
  }
}, fileBudget);

interface Project {
  project: string;
  apiKey: string;
}

async function provision(): Promise<Project> {
  const apiKey = `ac_${randomUUID()}`;
  const provisioned = await store.provision({
    verifier: createHash("sha256").update(apiKey).digest("hex"),
    permissions,
    key: "reuse",
    workspaceName: "Field types workspace",
    projectName: `Field types ${randomUUID()}`,
  });
  return { project: provisioned.project, apiKey };
}

async function request(
  target: Project,
  method: "GET" | "POST",
  path: string,
  options: { body?: unknown; contract?: string } = {},
) {
  const headers: Record<string, string> = { authorization: `Bearer ${target.apiKey}` };
  if (options.contract !== undefined) headers["aircastle-schema"] = options.contract;
  if (options.body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${server.url}/api/projects/${target.project}${path}`, {
    method,
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  return { status: response.status, body: (await response.json()) as unknown };
}

async function publish(
  target: Project,
  definitions: CollectionDefinitions,
  baseline: string | null = null,
) {
  expect(() => describeCollections(definitions)).not.toThrow();
  return request(target, "POST", "/schema", {
    body: { baseline, collections: describeCollections(definitions) },
  });
}

async function published(
  target: Project,
  definitions: CollectionDefinitions,
  baseline: string | null = null,
): Promise<{ revision: string; contracts: Record<string, string> }> {
  const response = await publish(target, definitions, baseline);
  expect(response).toEqual({
    status: 200,
    body: { ok: true, data: { revision: expect.any(String), contracts: expect.any(Object) } },
  });
  return (response.body as { data: { revision: string; contracts: Record<string, string> } }).data;
}

function clientFor<const Collections extends CollectionDefinitions>(
  target: Project,
  collections: Collections,
): AircastleClient<Collections> {
  return createClient({
    ...defineConfig({ url: server.url, project: target.project, collections }),
    apiKey: target.apiKey,
  });
}

function saved<Data>(result: { ok: true; data: Data } | { ok: false; error: unknown }): Data {
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) throw new Error("Expected success");
  return result.data;
}

const documents = (target: Project, name: string) =>
  store.transaction(target.project, (transaction) => transaction.documents(name));

const notFound = (path: (string | number)[], collection: string) => ({
  code: "not_found",
  path,
  collection,
  message: expect.any(String),
});

const authors = collection({ name: text() });
const articles = collection({
  title: text(),
  slug: text().unique(),
  author: reference("authors"),
  coauthors: list(reference("authors")).optional(),
});
const referenceSchema = { authors, articles };

const pages = collection({
  layout: blocks({
    hero: object({ heading: text() }),
    quote: object({ text: text() }),
  }),
  rows: list(object({ a: text() })),
  panel: object({ content: blocks({ note: object({ body: text() }) }) }),
});

const everything = collection({
  title: text(),
  count: number().int(),
  big: number().int(),
  ratio: number(),
  zero: number(),
  flag: boolean(),
  day: date(),
  at: datetime(),
  tags: list(text()),
  seo: object({ description: text().optional() }),
  author: reference("authors"),
  subject: reference(["authors"]),
  layout: blocks({ hero: object({ heading: text() }), quote: object({ text: text() }) }),
  sections: list(
    object({
      heading: text(),
      detail: object({ content: blocks({ quote: object({ text: text() }) }) }),
    }),
  ),
  meta: json(),
  location: point(),
});

test(
  "a reference to an existing document is created and read back as the stored id",
  async () => {
    const target = await provision();
    await published(target, referenceSchema);
    const client = clientFor(target, referenceSchema);
    const writer = saved(await client.authors.create({ name: "Writer" }));
    const created = await client.articles.create({
      title: "Hello",
      slug: "hello",
      author: writer.id,
      coauthors: [writer.id],
    });
    expect(created).toEqual({
      ok: true,
      data: {
        id: generated,
        title: "Hello",
        slug: "hello",
        author: writer.id,
        coauthors: [writer.id],
      },
    });
    const article = saved(created);
    expect(await client.articles.findById(article.id)).toEqual({ ok: true, data: article });
  },
  fileBudget,
);

test(
  "missing targets, including inside a list, are not_found and nothing is written",
  async () => {
    const target = await provision();
    await published(target, referenceSchema);
    const client = clientFor(target, referenceSchema);
    const writer = saved(await client.authors.create({ name: "Writer" }));
    expect(
      await client.articles.create({
        title: "Missing",
        slug: "missing",
        author: randomUUID(),
        coauthors: [writer.id, randomUUID()],
      }),
    ).toEqual({
      ok: false,
      error: {
        code: "validation_failed",
        issues: [notFound(["author"], "authors"), notFound(["coauthors", 1], "authors")],
      },
    });
    expect(await documents(target, "articles")).toEqual([]);
  },
  fileBudget,
);

test(
  "malformed and uppercase reference ids are not_found without case conversion",
  async () => {
    const target = await provision();
    await published(target, referenceSchema);
    const client = clientFor(target, referenceSchema);
    const writer = saved(await client.authors.create({ name: "Writer" }));
    expect(
      await client.articles.create({
        title: "Malformed",
        slug: "malformed",
        author: "a_123",
        coauthors: [writer.id.toUpperCase()],
      }),
    ).toEqual({
      ok: false,
      error: {
        code: "validation_failed",
        issues: [notFound(["author"], "authors"), notFound(["coauthors", 0], "authors")],
      },
    });
    expect(await documents(target, "articles")).toEqual([]);
  },
  fileBudget,
);

test(
  "the API reports field issues, then missing references, then uniqueness",
  async () => {
    const target = await provision();
    const publication = await published(target, referenceSchema);
    const contract = publication.contracts.articles!;
    const client = clientFor(target, referenceSchema);
    const writer = saved(await client.authors.create({ name: "Writer" }));
    saved(await client.articles.create({ title: "First", slug: "taken", author: writer.id }));
    const create = (body: unknown) =>
      request(target, "POST", "/collections/articles/documents", { body, contract });

    expect(await create({ title: 5, slug: "taken", author: randomUUID() })).toEqual({
      status: 422,
      body: {
        ok: false,
        error: {
          code: "validation_failed",
          issues: [
            {
              code: "invalid_type",
              path: ["title"],
              expected: "string",
              received: "number",
              message: expect.any(String),
            },
          ],
        },
      },
    });
    expect(await create({ title: "Fixed", slug: "taken", author: randomUUID() })).toEqual({
      status: 422,
      body: {
        ok: false,
        error: { code: "validation_failed", issues: [notFound(["author"], "authors")] },
      },
    });
    expect(await create({ title: "Fixed", slug: "taken", author: writer.id })).toEqual({
      status: 409,
      body: { ok: false, error: { code: "unique_conflict", field: "slug" } },
    });
    expect(await documents(target, "articles")).toHaveLength(1);
  },
  fileBudget,
);

test(
  "create assigns ids to blocks and list rows at every depth and keeps supplied ids",
  async () => {
    const target = await provision();
    await published(target, { pages });
    const client = clientFor(target, { pages });
    const created = saved(
      await client.pages.create({
        layout: [
          { type: "hero", heading: "Hi" },
          { type: "quote", text: "Kept", id: "b1" },
        ],
        rows: [{ a: "x" }, { a: "y", id: "r1" }],
        panel: { content: [{ type: "note", body: "Nested" }] },
      }),
    );
    expect(created).toEqual({
      id: generated,
      layout: [
        { type: "hero", heading: "Hi", id: generated },
        { type: "quote", text: "Kept", id: "b1" },
      ],
      rows: [
        { a: "x", id: generated },
        { a: "y", id: "r1" },
      ],
      panel: { content: [{ type: "note", body: "Nested", id: generated }] },
    });
    const assigned = [created.layout[0]?.id, created.rows[0]?.id, created.panel.content[0]?.id];
    expect(new Set(assigned).size).toBe(3);
    expect(await client.pages.findById(created.id)).toEqual({ ok: true, data: created });
  },
  fileBudget,
);

test(
  "a document using every kind reads back equal to its validated output plus assigned ids",
  async () => {
    const target = await provision();
    const schema = { authors, everything };
    await published(target, schema);
    const client = clientFor(target, schema);
    const writer = saved(await client.authors.create({ name: "Writer" }));
    const created = saved(
      await client.everything.create({
        title: "All",
        count: 3,
        big: 2 ** 53 - 1,
        ratio: 0.1,
        zero: -0,
        flag: false,
        day: "2024-02-29",
        at: "2026-02-14T09:00+11:00",
        tags: ["a", "b"],
        seo: {},
        author: writer.id,
        subject: { collection: "authors", id: writer.id },
        layout: [
          { type: "hero", heading: "Hi" },
          { type: "quote", text: "Kept", id: "b1" },
        ],
        sections: [
          { heading: "One", detail: { content: [{ type: "quote", text: "Deep" }] } },
          { heading: "Two", id: "r1", detail: { content: [] } },
        ],
        meta: { a: [1, "x", true, null, { b: -0 }], big: 2 ** 53 - 1, frac: 0.1 },
        location: { lat: -33.86, lng: 151.21 },
      }),
    );
    expect(created).toEqual({
      id: generated,
      title: "All",
      count: 3,
      big: 9007199254740991,
      ratio: 0.1,
      zero: 0,
      flag: false,
      day: "2024-02-29",
      at: "2026-02-13T22:00:00.000Z",
      tags: ["a", "b"],
      seo: {},
      author: writer.id,
      subject: { collection: "authors", id: writer.id },
      layout: [
        { type: "hero", heading: "Hi", id: generated },
        { type: "quote", text: "Kept", id: "b1" },
      ],
      sections: [
        {
          heading: "One",
          id: generated,
          detail: { content: [{ type: "quote", text: "Deep", id: generated }] },
        },
        { heading: "Two", id: "r1", detail: { content: [] } },
      ],
      meta: { a: [1, "x", true, null, { b: 0 }], big: 9007199254740991, frac: 0.1 },
      location: { lat: -33.86, lng: 151.21 },
    });
    expect(await client.everything.findById(created.id)).toEqual({ ok: true, data: created });
    const { state, stored } = await store.transaction(target.project, async (transaction) => ({
      state: await transaction.state(),
      stored: await transaction.read("everything", created.id),
    }));
    expect(stored).toEqual(created);
    if (!stored) throw new Error("Expected a stored document");
    const description = state.collections.find((entry) => entry.name === "everything")!.description;
    const { id: _id, ...data } = stored;
    expect(validateStored(description, data)).toBe(true);
    expect(projectDocument(description, description, stored)).toEqual({
      ok: true,
      data: created,
    });
  },
  fileBudget,
);

test(
  "an app on an older config creates without a new defaulted nested field and reads without it",
  async () => {
    const target = await provision();
    const before = {
      notes: collection({ title: text(), seo: object({ description: text().optional() }) }),
    };
    const after = {
      notes: collection({
        title: text(),
        seo: object({ description: text().optional(), slug: text().default("") }),
      }),
    };
    const first = await published(target, before);
    await published(target, after, first.revision);
    const old = clientFor(target, before);
    const created = await old.notes.create({ title: "Old", seo: {} });
    expect(created).toEqual({ ok: true, data: { id: generated, title: "Old", seo: {} } });
    const note = saved(created);
    expect(await old.notes.findById(note.id)).toEqual({
      ok: true,
      data: { id: note.id, title: "Old", seo: {} },
    });
  },
  fileBudget,
);

test(
  "an app on an older config reads only the block types it declares",
  async () => {
    const target = await provision();
    const before = {
      landing: collection({ layout: blocks({ hero: object({ heading: text() }) }) }),
    };
    const after = {
      landing: collection({
        layout: blocks({ hero: object({ heading: text() }), video: object({ url: text() }) }),
      }),
    };
    const first = await published(target, before);
    await published(target, after, first.revision);
    const current = clientFor(target, after);
    const created = saved(
      await current.landing.create({
        layout: [
          { type: "hero", heading: "Hi" },
          { type: "video", url: "https://example.com/v" },
        ],
      }),
    );
    expect(created).toEqual({
      id: generated,
      layout: [
        { type: "hero", heading: "Hi", id: generated },
        { type: "video", url: "https://example.com/v", id: generated },
      ],
    });
    const old = clientFor(target, before);
    expect(await old.landing.findById(created.id)).toEqual({
      ok: true,
      data: { id: created.id, layout: [created.layout[0]] },
    });
  },
  fileBudget,
);

test(
  "retargeting a reference over stored documents requires migration and succeeds without them",
  async () => {
    const users = collection({ name: text() });
    const before = {
      authors,
      users,
      posts: collection({ title: text(), author: reference("authors") }),
    };
    const after = {
      authors,
      users,
      posts: collection({ title: text(), author: reference("users") }),
    };

    const stored = await provision();
    const first = await published(stored, before);
    const client = clientFor(stored, before);
    const writer = saved(await client.authors.create({ name: "Writer" }));
    saved(await client.posts.create({ title: "Post", author: writer.id }));
    expect(await publish(stored, after, first.revision)).toEqual({
      status: 409,
      body: { ok: false, error: { code: "migration_required" } },
    });
    const textField = { type: "text", required: true, nullable: false, unique: false };
    expect(await request(stored, "GET", "/schema")).toEqual({
      status: 200,
      body: {
        ok: true,
        data: {
          revision: first.revision,
          collections: [
            { name: "authors", description: { fields: { name: textField } } },
            { name: "users", description: { fields: { name: textField } } },
            {
              name: "posts",
              description: {
                fields: {
                  title: textField,
                  author: {
                    type: "reference",
                    required: true,
                    nullable: false,
                    collection: "authors",
                  },
                },
              },
            },
          ],
        },
      },
    });

    const empty = await provision();
    const initial = await published(empty, before);
    const next = await published(empty, after, initial.revision);
    expect(next.revision).not.toBe(initial.revision);
  },
  fileBudget,
);
