import { createHash, randomUUID } from "node:crypto";
import { describe, expect, test } from "vite-plus/test";
import type { CollectionDescription, ContentDocument, Result } from "@aircastle/contracts";
import {
  createService,
  type Access,
  type ContentService,
  type ErrorSummary,
} from "@aircastle/core";
import { withDatabase } from "./test-support/database.ts";
import { expectQueued, holdProjectLock } from "./test-support/project-lock.ts";

const failOnReport = (summary: ErrorSummary) => {
  throw summary;
};

const fields = {
  title: { type: "text", required: true, nullable: false, unique: false, min: 1 },
  slug: { type: "text", required: true, nullable: false, unique: true },
  status: {
    type: "text",
    required: false,
    nullable: false,
    unique: false,
    choices: ["draft", "published"],
    default: "draft",
  },
} as const satisfies CollectionDescription["fields"];
const current: CollectionDescription = {
  fields: { ...fields, summary: { type: "text", required: false, nullable: true, unique: false } },
};
const stricter: CollectionDescription = {
  fields: {
    ...fields,
    summary: { type: "text", required: false, nullable: true, unique: false, max: 5 },
  },
};

function successful<Value>(result: Result<Value>): Value {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`Expected success, received ${result.error.code}`);
  return result.data;
}

async function withRace(
  operation: (fixture: {
    cms: ContentService;
    access: Access;
    contract: string;
    revision: string;
    document: ContentDocument;
    hold: () => Promise<{ release: () => Promise<void> }>;
    queued: (count: number, pending: readonly Promise<unknown>[], label: string) => Promise<void>;
  }) => Promise<void>,
) {
  await withDatabase(async ({ sql, store, namespace }) => {
    await store.initialize();
    const apiKey = `ac_${randomUUID()}`;
    const { project } = await store.provision({
      verifier: createHash("sha256").update(apiKey).digest("hex"),
      permissions: ["content:read", "content:write", "schema:publish"],
      key: "reuse",
      workspaceName: "Race workspace",
      projectName: "Race project",
    });
    const access = { project, apiKey };
    const cms = createService(store, failOnReport);
    const publication = successful(
      await cms.publish(access, {
        baseline: null,
        collections: [{ name: "articles", description: current }],
      }),
    );
    const contract = publication.contracts.articles!;
    const document = successful(
      await cms.create(access, "articles", contract, { title: "Hello", slug: "hello" }),
    );
    expect(document).toEqual({ id: document.id, title: "Hello", slug: "hello", status: "draft" });
    await operation({
      cms,
      access,
      contract,
      revision: publication.revision,
      document,
      hold: () => holdProjectLock(sql, namespace, project),
      queued: (count, pending, label) => expectQueued(sql, namespace, count, pending, label),
    });
  });
}

describe("R4 forced interleavings on the project lock", () => {
  test("two queued updates to different fields of one document both persist", async () => {
    await withRace(async ({ cms, access, contract, document, hold, queued }) => {
      const lock = await hold();
      let first: Promise<Result<ContentDocument>> | undefined;
      let second: Promise<Result<ContentDocument>> | undefined;
      try {
        first = cms.update(access, "articles", contract, document.id, {
          changes: { title: "Hello again" },
          unset: [],
        });
        await queued(1, [first], "the first update waits on the project lock");
        second = cms.update(access, "articles", contract, document.id, {
          changes: { summary: "Second writer" },
          unset: [],
        });
        await queued(2, [first, second], "both updates wait on the project lock");
      } finally {
        await lock.release();
      }
      expect(await first).toEqual({
        ok: true,
        data: { id: document.id, title: "Hello again", slug: "hello", status: "draft" },
      });
      expect(await second).toEqual({
        ok: true,
        data: {
          id: document.id,
          title: "Hello again",
          slug: "hello",
          status: "draft",
          summary: "Second writer",
        },
      });
      expect(await cms.findById(access, "articles", contract, document.id)).toEqual({
        ok: true,
        data: {
          id: document.id,
          title: "Hello again",
          slug: "hello",
          status: "draft",
          summary: "Second writer",
        },
      });
    });
  });

  test("two queued updates to the same field keep the later committed value", async () => {
    await withRace(async ({ cms, access, contract, document, hold, queued }) => {
      const lock = await hold();
      let first: Promise<Result<ContentDocument>> | undefined;
      let second: Promise<Result<ContentDocument>> | undefined;
      try {
        first = cms.update(access, "articles", contract, document.id, {
          changes: { title: "First writer" },
          unset: [],
        });
        await queued(1, [first], "the first update waits on the project lock");
        second = cms.update(access, "articles", contract, document.id, {
          changes: { title: "Second writer" },
          unset: [],
        });
        await queued(2, [first, second], "both updates wait on the project lock");
      } finally {
        await lock.release();
      }
      expect(await first).toEqual({
        ok: true,
        data: { id: document.id, title: "First writer", slug: "hello", status: "draft" },
      });
      expect(await second).toEqual({
        ok: true,
        data: { id: document.id, title: "Second writer", slug: "hello", status: "draft" },
      });
      expect(await cms.findById(access, "articles", contract, document.id)).toEqual({
        ok: true,
        data: { id: document.id, title: "Second writer", slug: "hello", status: "draft" },
      });
    });
  });

  test("an update committed before a stricter publication blocks that publication", async () => {
    await withRace(async ({ cms, access, contract, revision, document, hold, queued }) => {
      const lock = await hold();
      let update: Promise<Result<ContentDocument>> | undefined;
      let publication: ReturnType<ContentService["publish"]> | undefined;
      try {
        update = cms.update(access, "articles", contract, document.id, {
          changes: { summary: "Longer than five" },
          unset: [],
        });
        await queued(1, [update], "the update waits on the project lock");
        publication = cms.publish(access, {
          baseline: revision,
          collections: [{ name: "articles", description: stricter }],
        });
        await queued(2, [update, publication], "update and publication wait on the project lock");
      } finally {
        await lock.release();
      }
      const updated = {
        id: document.id,
        title: "Hello",
        slug: "hello",
        status: "draft",
        summary: "Longer than five",
      };
      expect(await update).toEqual({ ok: true, data: updated });
      expect(await publication).toEqual({ ok: false, error: { code: "migration_required" } });
      expect(await cms.schema(access)).toEqual({
        ok: true,
        data: { revision, collections: [{ name: "articles", description: current }] },
      });
      expect(await cms.findById(access, "articles", contract, document.id)).toEqual({
        ok: true,
        data: updated,
      });
    });
  });

  test("an update admitted under the older schema cannot commit after a stricter publication", async () => {
    await withRace(async ({ cms, access, contract, revision, document, hold, queued }) => {
      const lock = await hold();
      let publication: ReturnType<ContentService["publish"]> | undefined;
      let update: Promise<Result<ContentDocument>> | undefined;
      try {
        publication = cms.publish(access, {
          baseline: revision,
          collections: [{ name: "articles", description: stricter }],
        });
        await queued(1, [publication], "the publication waits on the project lock");
        update = cms.update(access, "articles", contract, document.id, {
          changes: { summary: "Longer than five" },
          unset: [],
        });
        await queued(2, [publication, update], "publication and update wait on the project lock");
      } finally {
        await lock.release();
      }
      const published = await publication;
      expect(published).toEqual({
        ok: true,
        data: {
          revision: expect.any(String),
          contracts: { articles: expect.stringMatching(/^v1:[a-f0-9]{64}$/) },
        },
      });
      expect(await update).toEqual({ ok: false, error: { code: "schema_mismatch" } });
      if (!published.ok) return;
      expect(published.data.revision).not.toBe(revision);
      expect(
        await cms.findById(access, "articles", published.data.contracts.articles!, document.id),
      ).toEqual({ ok: true, data: document });
    });
  });
});
