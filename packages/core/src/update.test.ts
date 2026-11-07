import { describe, expect, test } from "vite-plus/test";
import type {
  CollectionDescription,
  ContentDocument,
  DocumentUpdate,
  Permission,
} from "@aircastle/contracts";
import { createService, type ErrorSummary, type ReportError } from "./index.ts";
import { access, contract, controlledStore, failOnReport } from "./test-support/fixtures.ts";

const idA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const idB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const missingId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const message = expect.any(String);

const posts: CollectionDescription = {
  fields: {
    title: { type: "text", required: true, nullable: false, unique: false, min: 1 },
    slug: { type: "text", required: true, nullable: false, unique: true },
    subtitle: { type: "text", required: true, nullable: true, unique: false },
    summary: { type: "text", required: false, nullable: true, unique: false },
    code: { type: "text", required: false, nullable: true, unique: true },
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
const withTitleMin = (min: number): CollectionDescription => ({
  fields: { ...posts.fields, title: { ...posts.fields.title!, min } },
});
const withoutSummary: CollectionDescription = {
  fields: Object.fromEntries(Object.entries(posts.fields).filter(([name]) => name !== "summary")),
};

const first: ContentDocument = {
  id: idA,
  title: "Hello",
  slug: "hello",
  subtitle: "Old",
  status: "published",
};
const second: ContentDocument = {
  id: idB,
  title: "World",
  slug: "world",
  subtitle: null,
  status: "draft",
};

type Authorization = "authorized" | "unauthorized" | "forbidden";

function setup(
  options: {
    documents?: ContentDocument[];
    server?: CollectionDescription;
    client?: CollectionDescription | "unknown";
    authorization?: (permission: Permission) => Authorization;
    report?: ReportError;
  } = {},
) {
  const client = options.client ?? posts;
  const controlled = controlledStore({
    state: {
      revision: "revision-start",
      collections: [{ name: "articles", description: options.server ?? posts }],
    },
    contracts: client === "unknown" ? {} : { [contract]: client },
    documents: { articles: options.documents ?? [first, second] },
    ...(options.authorization ? { authorization: options.authorization } : {}),
  });
  const cms = createService(controlled.store, options.report ?? failOnReport);
  return {
    ...controlled,
    update: (
      id: string,
      changes: unknown,
      unset: readonly string[] = [],
      collection = "articles",
    ) => cms.update(access, collection, contract, id, { changes, unset } satisfies DocumentUpdate),
    read: (id: string) => cms.findById(access, "articles", contract, id),
    stored: () => controlled.snapshotDocuments("articles"),
  };
}

function reporting() {
  const reported: ErrorSummary[] = [];
  return { reported, report: (error: ErrorSummary) => void reported.push(error) };
}

describe("R2 update merges supplied fields", () => {
  test("the R2 example replaces title and keeps every omitted field", async () => {
    const fixture = setup();
    const expected = {
      id: idA,
      title: "Hello again",
      slug: "hello",
      subtitle: "Old",
      status: "published",
    };
    expect(await fixture.update(idA, { title: "Hello again" })).toEqual({
      ok: true,
      data: expected,
    });
    expect(await fixture.read(idA)).toEqual({ ok: true, data: expected });
    expect(await fixture.read(idB)).toEqual({ ok: true, data: second });
  });

  test("B47 an omitted defaulted field keeps its stored value instead of the default", async () => {
    const fixture = setup();
    expect(await fixture.update(idA, { summary: "Added" })).toEqual({
      ok: true,
      data: {
        id: idA,
        title: "Hello",
        slug: "hello",
        subtitle: "Old",
        summary: "Added",
        status: "published",
      },
    });
    expect(fixture.stored()).toEqual([
      {
        id: idA,
        title: "Hello",
        slug: "hello",
        subtitle: "Old",
        summary: "Added",
        status: "published",
      },
      second,
    ]);
  });

  test("B47 an omitted absent optional field stays absent", async () => {
    const fixture = setup();
    expect(await fixture.update(idA, { subtitle: "New" })).toEqual({
      ok: true,
      data: { id: idA, title: "Hello", slug: "hello", subtitle: "New", status: "published" },
    });
    expect(fixture.stored()[0]).toEqual({
      id: idA,
      title: "Hello",
      slug: "hello",
      subtitle: "New",
      status: "published",
    });
  });

  test("success projects to an older client contract and keeps fields it cannot see", async () => {
    const stored = { ...first, summary: "Hidden" };
    const fixture = setup({ documents: [stored], client: withoutSummary });
    expect(await fixture.update(idA, { title: "Renamed" })).toEqual({
      ok: true,
      data: { id: idA, title: "Renamed", slug: "hello", subtitle: "Old", status: "published" },
    });
    expect(fixture.stored()).toEqual([{ ...stored, title: "Renamed" }]);
  });
});

describe("R2 explicit null", () => {
  test.each([
    ["nullable optional summary", { summary: null }, { ...first, summary: null }],
    ["nullable required subtitle", { subtitle: null }, { ...first, subtitle: null }],
  ])("stores null for %s", async (_name, changes, expected) => {
    const fixture = setup();
    expect(await fixture.update(idA, changes)).toEqual({ ok: true, data: expected });
    expect(await fixture.read(idA)).toEqual({ ok: true, data: expected });
  });

  test.each([
    ["required title", "title"],
    ["defaulted status", "status"],
  ])("rejects null for non-nullable %s and persists nothing", async (_name, field) => {
    const fixture = setup();
    expect(await fixture.update(idA, { [field]: null })).toEqual({
      ok: false,
      error: {
        code: "validation_failed",
        issues: [
          { code: "invalid_type", path: [field], expected: "string", received: "null", message },
        ],
      },
    });
    expect(await fixture.read(idA)).toEqual({ ok: true, data: first });
  });
});

describe("R2 merged validation", () => {
  test("a merged value outside the schema fails with the schema issue and persists nothing", async () => {
    const fixture = setup();
    expect(await fixture.update(idA, { title: "", status: "archived" })).toEqual({
      ok: false,
      error: {
        code: "validation_failed",
        issues: [
          {
            code: "too_short",
            path: ["title"],
            minimum: 1,
            actual: 0,
            unit: "graphemes",
            message,
          },
          { code: "invalid_choice", path: ["status"], allowed: ["draft", "published"], message },
        ],
      },
    });
    expect(await fixture.read(idA)).toEqual({ ok: true, data: first });
  });

  test.each([
    ["an undeclared field", { extra: "value" }, "extra"],
    ["id", { id: idB }, "id"],
  ])("changes containing %s give an unknown_field issue", async (_name, changes, field) => {
    const fixture = setup();
    expect(await fixture.update(idA, changes)).toEqual({
      ok: false,
      error: {
        code: "validation_failed",
        issues: [{ code: "unknown_field", path: [field], message }],
      },
    });
    expect(fixture.stored()).toEqual([first, second]);
  });
});

describe("R2 R13 no-op update", () => {
  test("no changes and no unset returns the current projected document and writes nothing", async () => {
    const stored = { ...first, summary: "Hidden" };
    const fixture = setup({ documents: [stored, second], client: withoutSummary });
    expect(await fixture.update(idA, {})).toEqual({
      ok: true,
      data: { id: idA, title: "Hello", slug: "hello", subtitle: "Old", status: "published" },
    });
    expect(fixture.stored()).toEqual([stored, second]);
  });

  test("a no-op on a missing document is not_found", async () => {
    expect(await setup().update(missingId, {})).toEqual({
      ok: false,
      error: { code: "not_found" },
    });
  });

  test("a no-op with an incompatible contract is schema_mismatch", async () => {
    const fixture = setup({ server: withTitleMin(5) });
    expect(await fixture.update(idA, {})).toEqual({
      ok: false,
      error: { code: "schema_mismatch" },
    });
  });

  test("a no-op on a corrupt stored document is a reported internal_error", async () => {
    const corrupt = { id: idA, title: "Hello", slug: "hello" };
    const { reported, report } = reporting();
    const fixture = setup({ documents: [corrupt], report });
    expect(await fixture.update(idA, {})).toEqual({ ok: false, error: { code: "internal_error" } });
    expect(reported).toEqual([expect.any(Error)]);
  });
});

describe("R2 document identity", () => {
  test("a missing document returns not_found and creates nothing", async () => {
    const fixture = setup();
    expect(await fixture.update(missingId, { title: "Ghost" })).toEqual({
      ok: false,
      error: { code: "not_found" },
    });
    expect(fixture.stored()).toEqual([first, second]);
  });

  test("R13 an uppercase path id updates the document and the result id is lowercase", async () => {
    const fixture = setup();
    const expected = { ...first, title: "Shouted" };
    expect(await fixture.update(idA.toUpperCase(), { title: "Shouted" })).toEqual({
      ok: true,
      data: expected,
    });
    expect(await fixture.read(idA)).toEqual({ ok: true, data: expected });
    expect(fixture.stored()).toEqual([expected, second]);
  });

  test("a malformed id returns invalid_request", async () => {
    const fixture = setup();
    expect(await fixture.update("not-a-uuid", { title: "Ghost" })).toEqual({
      ok: false,
      error: { code: "invalid_request" },
    });
    expect(fixture.stored()).toEqual([first, second]);
  });
});

describe("R3 unset", () => {
  test("the R3 example removes an optional field so it becomes absent", async () => {
    const stored = { ...first, summary: "Old summary" };
    const fixture = setup({ documents: [stored, second] });
    const expected = {
      id: idA,
      title: "X",
      slug: "hello",
      subtitle: "Old",
      status: "published",
    };
    expect(await fixture.update(idA, { title: "X" }, ["summary"])).toEqual({
      ok: true,
      data: expected,
    });
    expect(await fixture.read(idA)).toEqual({ ok: true, data: expected });
  });

  test("unset removes a stored null value too", async () => {
    const stored = { ...first, summary: null };
    const fixture = setup({ documents: [stored] });
    expect(await fixture.update(idA, {}, ["summary"])).toEqual({ ok: true, data: first });
    expect(fixture.stored()).toEqual([first]);
  });

  test.each([
    ["required non-nullable title", "title"],
    ["required nullable subtitle", "subtitle"],
  ])("unsetting %s gives a required issue at its path", async (_name, field) => {
    const fixture = setup();
    expect(await fixture.update(idA, {}, [field])).toEqual({
      ok: false,
      error: { code: "validation_failed", issues: [{ code: "required", path: [field], message }] },
    });
    expect(await fixture.read(idA)).toEqual({ ok: true, data: first });
  });

  test("unsetting a defaulted field stores its default", async () => {
    const fixture = setup();
    const expected = { ...first, status: "draft" };
    expect(await fixture.update(idA, {}, ["status"])).toEqual({ ok: true, data: expected });
    expect(await fixture.read(idA)).toEqual({ ok: true, data: expected });
  });

  test("unsetting an absent field succeeds and changes nothing for it", async () => {
    const fixture = setup();
    const expected = { ...first, title: "Changed" };
    expect(await fixture.update(idA, { title: "Changed" }, ["summary"])).toEqual({
      ok: true,
      data: expected,
    });
    expect(fixture.stored()).toEqual([expected, second]);
  });

  test("naming a field in both changes and unset is invalid_request", async () => {
    const fixture = setup();
    expect(await fixture.update(idA, { summary: "New" }, ["summary"])).toEqual({
      ok: false,
      error: { code: "invalid_request" },
    });
    expect(fixture.stored()).toEqual([first, second]);
  });

  test.each([
    ["an undeclared field", "extra"],
    ["id", "id"],
  ])("unsetting %s gives an unknown_field issue", async (_name, field) => {
    const fixture = setup();
    expect(await fixture.update(idA, {}, [field])).toEqual({
      ok: false,
      error: {
        code: "validation_failed",
        issues: [{ code: "unknown_field", path: [field], message }],
      },
    });
    expect(fixture.stored()).toEqual([first, second]);
  });

  test("B35 unknown unset names sort with validation unknown fields after field issues", async () => {
    const fixture = setup();
    expect(
      await fixture.update(idA, { title: null, zeta: "z", id: idB }, ["alpha", "mid"]),
    ).toEqual({
      ok: false,
      error: {
        code: "validation_failed",
        issues: [
          {
            code: "invalid_type",
            path: ["title"],
            expected: "string",
            received: "null",
            message,
          },
          { code: "unknown_field", path: ["alpha"], message },
          { code: "unknown_field", path: ["id"], message },
          { code: "unknown_field", path: ["mid"], message },
          { code: "unknown_field", path: ["zeta"], message },
        ],
      },
    });
    expect(fixture.stored()).toEqual([first, second]);
  });
});

describe("R4 update rules shared with create", () => {
  test("a contract that fails create compatibility is schema_mismatch even when the change fits", async () => {
    const fixture = setup({ server: withTitleMin(5) });
    expect(await fixture.update(idA, { summary: "Fits" })).toEqual({
      ok: false,
      error: { code: "schema_mismatch" },
    });
    expect(fixture.stored()).toEqual([first, second]);
  });

  test("an unknown contract is schema_mismatch", async () => {
    const fixture = setup({ client: "unknown" });
    expect(await fixture.update(idA, { title: "New" })).toEqual({
      ok: false,
      error: { code: "schema_mismatch" },
    });
    expect(fixture.stored()).toEqual([first, second]);
  });

  test("update asks for content:write and a write-only key may update", async () => {
    const fixture = setup({
      authorization: (permission) => (permission === "content:write" ? "authorized" : "forbidden"),
    });
    expect(await fixture.update(idA, { title: "New" })).toEqual({
      ok: true,
      data: { ...first, title: "New" },
    });
    expect(fixture.observations.authorization.map((entry) => entry.permission)).toEqual([
      "content:write",
    ]);
  });

  test("a read-only key is forbidden and persists nothing", async () => {
    const fixture = setup({
      authorization: (permission) => (permission === "content:read" ? "authorized" : "forbidden"),
    });
    expect(await fixture.update(idA, { title: "New" })).toEqual({
      ok: false,
      error: { code: "forbidden" },
    });
    expect(await fixture.read(idA)).toEqual({ ok: true, data: first });
  });

  test("a stored document invalid under the active schema is a reported internal_error", async () => {
    const corrupt = { id: idA, title: "Hello", slug: "hello" };
    const { reported, report } = reporting();
    const fixture = setup({ documents: [corrupt], report });
    expect(await fixture.update(idA, { subtitle: "Would repair it" })).toEqual({
      ok: false,
      error: { code: "internal_error" },
    });
    expect(reported).toEqual([expect.any(Error)]);
    expect(fixture.stored()).toEqual([corrupt]);
  });

  test("a result that does not fit the client contract is schema_mismatch and persists nothing", async () => {
    const fixture = setup({ client: withTitleMin(5) });
    expect(await fixture.update(idA, { title: "Hi" })).toEqual({
      ok: false,
      error: { code: "schema_mismatch" },
    });
    expect(await fixture.read(idA)).toEqual({ ok: true, data: first });
  });
});

describe("R4 R13 uniqueness", () => {
  test("keeping the document's own unique value is not a conflict", async () => {
    const fixture = setup();
    const expected = { ...first, title: "Kept", slug: "hello" };
    expect(await fixture.update(idA, { title: "Kept", slug: "hello" })).toEqual({
      ok: true,
      data: expected,
    });
    expect(await fixture.read(idA)).toEqual({ ok: true, data: expected });
  });

  test("taking another document's value returns unique_conflict and persists nothing", async () => {
    const fixture = setup();
    expect(await fixture.update(idA, { title: "Clash", slug: "world" })).toEqual({
      ok: false,
      error: { code: "unique_conflict", field: "slug" },
    });
    expect(await fixture.read(idA)).toEqual({ ok: true, data: first });
    expect(await fixture.read(idB)).toEqual({ ok: true, data: second });
  });

  test("unique values are case-sensitive", async () => {
    const fixture = setup();
    expect(await fixture.update(idA, { slug: "World" })).toEqual({
      ok: true,
      data: { ...first, slug: "World" },
    });
  });

  test("changing a unique value releases the old one for another document", async () => {
    const fixture = setup();
    expect(await fixture.update(idA, { slug: "moved" })).toEqual({
      ok: true,
      data: { ...first, slug: "moved" },
    });
    expect(await fixture.update(idB, { slug: "hello" })).toEqual({
      ok: true,
      data: { ...second, slug: "hello" },
    });
  });

  test("setting a unique field to null releases its value", async () => {
    const fixture = setup({ documents: [{ ...first, code: "X1" }, second] });
    expect(await fixture.update(idA, { code: null })).toEqual({
      ok: true,
      data: { ...first, code: null },
    });
    expect(await fixture.update(idB, { code: "X1" })).toEqual({
      ok: true,
      data: { ...second, code: "X1" },
    });
  });

  test("unsetting a unique field releases its value", async () => {
    const fixture = setup({ documents: [{ ...first, code: "X1" }, second] });
    expect(await fixture.update(idA, {}, ["code"])).toEqual({ ok: true, data: first });
    expect(await fixture.update(idB, { code: "X1" })).toEqual({
      ok: true,
      data: { ...second, code: "X1" },
    });
  });

  test("a value held by another document stays taken", async () => {
    const fixture = setup({ documents: [{ ...first, code: "X1" }, second] });
    expect(await fixture.update(idB, { code: "X1" })).toEqual({
      ok: false,
      error: { code: "unique_conflict", field: "code" },
    });
    expect(await fixture.read(idB)).toEqual({ ok: true, data: second });
  });
});

describe("R13 update error order", () => {
  test("step 1 before step 7: a name in both lists wins over a missing document", async () => {
    expect(await setup().update(missingId, { summary: "x" }, ["summary"])).toEqual({
      ok: false,
      error: { code: "invalid_request" },
    });
  });

  test("step 1 before step 9: a name in both lists wins over unknown and invalid fields", async () => {
    expect(await setup().update(idA, { extra: "x", title: null }, ["extra"])).toEqual({
      ok: false,
      error: { code: "invalid_request" },
    });
  });

  test("step 3 before step 5: a malformed id wins over an unknown collection", async () => {
    expect(await setup().update("not-a-uuid", { title: "x" }, [], "missing")).toEqual({
      ok: false,
      error: { code: "invalid_request" },
    });
  });

  test("step 4 before step 5: a forbidden key wins over an unknown collection", async () => {
    const fixture = setup({
      authorization: (permission) => (permission === "content:read" ? "authorized" : "forbidden"),
    });
    expect(await fixture.update(idA, { title: "x" }, [], "missing")).toEqual({
      ok: false,
      error: { code: "forbidden" },
    });
  });

  test("step 5 before step 6: an unknown collection wins over an unknown contract", async () => {
    expect(await setup({ client: "unknown" }).update(idA, { title: "x" }, [], "missing")).toEqual({
      ok: false,
      error: { code: "not_found" },
    });
  });

  test("step 6 before step 7: schema_mismatch wins over a missing document", async () => {
    expect(await setup({ server: withTitleMin(5) }).update(missingId, { title: "x" })).toEqual({
      ok: false,
      error: { code: "schema_mismatch" },
    });
  });

  test("step 6 before step 9: schema_mismatch wins over invalid changes", async () => {
    expect(await setup({ client: "unknown" }).update(idA, { title: null })).toEqual({
      ok: false,
      error: { code: "schema_mismatch" },
    });
  });

  test("step 7 before step 9: a missing document wins over invalid changes", async () => {
    expect(await setup().update(missingId, { title: null }, ["extra"])).toEqual({
      ok: false,
      error: { code: "not_found" },
    });
  });

  test("step 8 before step 9: a corrupt stored document wins over invalid changes", async () => {
    const corrupt = { id: idA, title: "Hello", slug: "hello" };
    const { reported, report } = reporting();
    const fixture = setup({ documents: [corrupt], report });
    expect(await fixture.update(idA, { title: null })).toEqual({
      ok: false,
      error: { code: "internal_error" },
    });
    expect(reported).toEqual([expect.any(Error)]);
  });

  test("step 9 before step 11: validation_failed wins over a unique conflict", async () => {
    const fixture = setup();
    expect(await fixture.update(idA, { title: null, slug: "world" })).toEqual({
      ok: false,
      error: {
        code: "validation_failed",
        issues: [
          { code: "invalid_type", path: ["title"], expected: "string", received: "null", message },
        ],
      },
    });
    expect(fixture.stored()).toEqual([first, second]);
  });

  test("step 11 before step 12: unique_conflict wins over a result the client cannot read", async () => {
    const fixture = setup({ client: withTitleMin(5) });
    expect(await fixture.update(idA, { title: "Hi", slug: "world" })).toEqual({
      ok: false,
      error: { code: "unique_conflict", field: "slug" },
    });
    expect(await fixture.read(idA)).toEqual({ ok: true, data: first });
  });
});
