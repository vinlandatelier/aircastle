import { createHash, randomUUID } from "node:crypto";
import { describe, expect, test } from "vite-plus/test";
import type {
  CollectionDescription,
  ContentDocument,
  DocumentData,
  Result,
} from "@aircastle/contracts";
import {
  createService,
  type Access,
  type ContentService,
  type ErrorSummary,
} from "@aircastle/core";
import { withDatabase } from "./test-support/database.ts";

const failOnReport = (summary: ErrorSummary) => {
  throw summary;
};

const labels: CollectionDescription = {
  fields: {
    name: { type: "text", required: true, nullable: false, unique: true },
    label: { type: "text", required: false, nullable: true, unique: false },
  },
};

function successful<Value>(result: Result<Value>): Value {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`Expected success, received ${result.error.code}`);
  return result.data;
}

interface Fixture {
  cms: ContentService;
  access: Access;
  contract: string;
  create: (data: DocumentData) => Promise<ContentDocument>;
}

async function withLabels(operation: (fixture: Fixture) => Promise<void>) {
  await withDatabase(async ({ store }) => {
    await store.initialize();
    const apiKey = `ac_${randomUUID()}`;
    const { project } = await store.provision({
      verifier: createHash("sha256").update(apiKey).digest("hex"),
      permissions: ["content:read", "content:write", "schema:publish"],
      key: "reuse",
      workspaceName: "Ordering workspace",
      projectName: "Ordering project",
    });
    const access = { project, apiKey };
    const cms = createService(store, failOnReport);
    const publication = successful(
      await cms.publish(access, {
        baseline: null,
        collections: [{ name: "labels", description: labels }],
      }),
    );
    const contract = publication.contracts.labels!;
    const create = async (data: DocumentData) => {
      const document = successful(await cms.create(access, "labels", contract, data));
      expect(document).toEqual({ ...data, id: document.id });
      return document;
    };
    await operation({ cms, access, contract, create });
  });
}

async function collectPages(fixture: Fixture, sort: string, limit: number) {
  const documents: ContentDocument[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 50; page += 1) {
    const result = await fixture.cms.list(fixture.access, "labels", fixture.contract, {
      sort,
      limit,
      ...(cursor === undefined ? {} : { cursor }),
    });
    expect(result).toEqual({
      ok: true,
      data: { documents: expect.any(Array), next: expect.toBeOneOf([null, expect.any(String)]) },
    });
    if (!result.ok) break;
    documents.push(...result.data.documents);
    if (result.data.next === null) break;
    cursor = result.data.next;
  }
  return documents;
}

describe("R9 R13 root collation order on Postgres", () => {
  test("the hand-ordered word list sorts ascending and descending, missing and null last", async () => {
    await withLabels(async (fixture) => {
      const created = new Map<string, ContentDocument>();
      for (const [name, data] of [
        ["zebra", { label: "zebra" }],
        ["null", { label: null }],
        ["item10", { label: "item10" }],
        ["Banana", { label: "Banana" }],
        ["missing", {}],
        ["apple-old", { label: "apple" }],
        ["empty", { label: "" }],
        ["item2", { label: "item2" }],
        ["Éclair", { label: "Éclair" }],
        ["apple-new", { label: "apple" }],
        ["item1", { label: "item1" }],
      ] as const) {
        created.set(name, await fixture.create({ name, ...data }));
      }
      const named = (...names: string[]) => names.map((name) => created.get(name));
      const ascending = named(
        "empty",
        "apple-new",
        "apple-old",
        "Banana",
        "Éclair",
        "item1",
        "item10",
        "item2",
        "zebra",
        "missing",
        "null",
      );
      const descending = named(
        "zebra",
        "item2",
        "item10",
        "item1",
        "Éclair",
        "Banana",
        "apple-new",
        "apple-old",
        "empty",
        "missing",
        "null",
      );
      expect(
        await fixture.cms.list(fixture.access, "labels", fixture.contract, {
          sort: "label",
          limit: 100,
        }),
      ).toEqual({
        ok: true,
        data: { documents: ascending, next: null },
      });
      expect(
        await fixture.cms.list(fixture.access, "labels", fixture.contract, {
          sort: "-label",
          limit: 100,
        }),
      ).toEqual({
        ok: true,
        data: { documents: descending, next: null },
      });
      expect(await collectPages(fixture, "label", 2)).toEqual(ascending);
      expect(await collectPages(fixture, "-label", 3)).toEqual(descending);
    });
  });

  test("NFC and NFD é rank equal in the collation and are ordered by UTF-8 bytes", async () => {
    await withLabels(async (fixture) => {
      const plain = await fixture.create({ name: "plain", label: "e" });
      const decomposed = await fixture.create({ name: "decomposed", label: "é" });
      const composed = await fixture.create({ name: "composed", label: "é" });
      const following = await fixture.create({ name: "following", label: "f" });
      expect(
        await fixture.cms.list(fixture.access, "labels", fixture.contract, { sort: "label" }),
      ).toEqual({
        ok: true,
        data: { documents: [plain, decomposed, composed, following], next: null },
      });
      expect(
        await fixture.cms.list(fixture.access, "labels", fixture.contract, { sort: "-label" }),
      ).toEqual({
        ok: true,
        data: { documents: [following, composed, decomposed, plain], next: null },
      });
      expect(await collectPages(fixture, "label", 1)).toEqual([
        plain,
        decomposed,
        composed,
        following,
      ]);
    });
  });
});

describe("R7 R9 R13 field-sort pages on Postgres", () => {
  test("a descending page boundary inside a value tie keeps newer documents first", async () => {
    await withLabels(async (fixture) => {
      const appleOld = await fixture.create({ name: "apple-old", label: "apple" });
      const appleMid = await fixture.create({ name: "apple-mid", label: "apple" });
      const appleNew = await fixture.create({ name: "apple-new", label: "apple" });
      const banana = await fixture.create({ name: "banana", label: "banana" });
      const first = await fixture.cms.list(fixture.access, "labels", fixture.contract, {
        sort: "-label",
        limit: 2,
      });
      expect(first).toEqual({
        ok: true,
        data: { documents: [banana, appleNew], next: expect.any(String) },
      });
      if (!first.ok || first.data.next === null) return;
      expect(
        await fixture.cms.list(fixture.access, "labels", fixture.contract, {
          sort: "-label",
          limit: 2,
          cursor: first.data.next,
        }),
      ).toEqual({ ok: true, data: { documents: [appleMid, appleOld], next: null } });
    });
  });

  test("a field-sort cursor continues from its position after its anchor is deleted", async () => {
    await withLabels(async (fixture) => {
      const apple = await fixture.create({ name: "apple", label: "apple" });
      const banana = await fixture.create({ name: "banana", label: "banana" });
      const cherry = await fixture.create({ name: "cherry", label: "cherry" });
      const date = await fixture.create({ name: "date", label: "date" });
      const first = await fixture.cms.list(fixture.access, "labels", fixture.contract, {
        sort: "label",
        limit: 2,
      });
      expect(first).toEqual({
        ok: true,
        data: { documents: [apple, banana], next: expect.any(String) },
      });
      if (!first.ok || first.data.next === null) return;
      expect(
        await fixture.cms.delete(fixture.access, "labels", fixture.contract, banana.id),
      ).toEqual({ ok: true, data: { id: banana.id } });
      expect(
        await fixture.cms.list(fixture.access, "labels", fixture.contract, {
          sort: "label",
          limit: 2,
          cursor: first.data.next,
        }),
      ).toEqual({ ok: true, data: { documents: [cherry, date], next: null } });
    });
  });
});

describe("R8 is compares exact code points on Postgres", () => {
  test("an NFD filter value does not match an NFC stored value", async () => {
    await withLabels(async (fixture) => {
      const composed = await fixture.create({ name: "composed", label: "caf\u00e9" });
      const list = (label: string) =>
        fixture.cms.list(fixture.access, "labels", fixture.contract, { where: { label } });
      expect(await list("cafe\u0301")).toEqual({ ok: true, data: { documents: [], next: null } });
      expect(await list("caf\u00e9")).toEqual({
        ok: true,
        data: { documents: [composed], next: null },
      });
    });
  });
});

describe("R8 R13 contains lowercases with the full Unicode default mapping on Postgres", () => {
  test("contains matches by hand-written expected sets", async () => {
    await withLabels(async (fixture) => {
      const eclairUpper = await fixture.create({ name: "eclair-upper", label: "ÉCLAIR" });
      const eclairPlain = await fixture.create({ name: "eclair-plain", label: "eclair" });
      const dottedI = await fixture.create({ name: "dotted-i", label: "İ" });
      const odos = await fixture.create({ name: "odos", label: "ΟΔΟΣ" });
      const sharpS = await fixture.create({ name: "sharp-s", label: "ß" });
      const doubleS = await fixture.create({ name: "double-s", label: "SS" });
      const wildcards = await fixture.create({ name: "wildcards", label: "%_\\" });
      const ab = await fixture.create({ name: "ab", label: "ab" });
      await fixture.create({ name: "null", label: null });
      await fixture.create({ name: "missing" });
      const cases: [string, ContentDocument[]][] = [
        ["éclair", [eclairUpper]],
        ["ÉCLAIR", [eclairUpper]],
        ["écl", [eclairUpper]],
        ["eclair", [eclairPlain]],
        ["ECLAIR", [eclairPlain]],
        ["i", [dottedI, eclairPlain, eclairUpper]],
        ["İ", [dottedI]],
        ["i̇", [dottedI]],
        ["̇", [dottedI]],
        ["ΟΔΟΣ", [odos]],
        ["οδος", [odos]],
        ["οδοσ", []],
        ["Σ", []],
        ["ς", [odos]],
        ["ß", [sharpS]],
        ["ẞ", [sharpS]],
        ["ss", [doubleS]],
        ["SS", [doubleS]],
        ["%", [wildcards]],
        ["_", [wildcards]],
        ["\\", [wildcards]],
        ["%_\\", [wildcards]],
        ["a%", []],
        ["_b", []],
        ["A", [ab, eclairPlain, eclairUpper]],
      ];
      for (const [text, documents] of cases) {
        expect(
          await fixture.cms.list(fixture.access, "labels", fixture.contract, {
            where: { label: { contains: text } },
            limit: 100,
          }),
          `contains ${JSON.stringify(text)}`,
        ).toEqual({ ok: true, data: { documents, next: null } });
      }
    });
  });
});
