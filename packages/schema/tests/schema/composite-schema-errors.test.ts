import { describe, expect, test } from "vite-plus/test";
import {
  blocks,
  boolean,
  collection,
  compileSchema,
  datetime,
  list,
  number,
  object,
  reference,
  SchemaError,
  text,
} from "../../src/index.ts";
import { compileCollection, type FieldDeclaration } from "../support/collections.ts";
import {
  expectOwnKeys,
  expectSchemaError,
  expectSuccess,
  type ExpectedSchemaIssue,
} from "../support/assertions.ts";

/**
 * Asserts an `invalid_default` whose causes the spec leaves open: code, path and a nonempty
 * cause list are checked, cause contents are not.
 */
function expectInvalidDefaultWithOpenCauses(action: () => unknown, path: readonly string[]) {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(SchemaError);
  const issues = (thrown as SchemaError).issues as unknown as readonly Record<string, unknown>[];
  expect(issues).toHaveLength(1);
  const issue = issues[0]!;
  expectOwnKeys(issue, ["code", "path", "message", "causes"]);
  expect(issue.code).toBe("invalid_default");
  expect(issue.path).toEqual(path);
  expect(Array.isArray(issue.causes)).toBe(true);
  expect((issue.causes as unknown[]).length).toBeGreaterThan(0);
}

/** Compiles one `articles` collection, turning an unexpected `SchemaError` into an assertion failure. */
function compiles(fields: Readonly<Record<string, FieldDeclaration>>) {
  let compiled: ReturnType<typeof compileCollection> | undefined;
  expect(() => {
    compiled = compileCollection(fields);
  }).not.toThrow();
  return compiled!;
}

const hero = () => object({ heading: text() });

describe("composite schema error codes", () => {
  const cases: {
    name: string;
    field: () => FieldDeclaration;
    issues: ExpectedSchemaIssue[];
  }[] = [
    {
      name: "invalid_item optional",
      field: () => list(text().optional()),
      issues: [{ code: "invalid_item", path: ["articles", "field"], modifier: "optional" }],
    },
    {
      name: "invalid_item default",
      field: () => list(number().default(1)),
      issues: [{ code: "invalid_item", path: ["articles", "field"], modifier: "default" }],
    },
    {
      name: "invalid_item unique on a direct text item",
      field: () => list(text().unique()),
      issues: [{ code: "invalid_item", path: ["articles", "field"], modifier: "unique" }],
    },
    {
      name: "invalid_item optional on an object item",
      field: () => list(object({ a: text() }).optional()),
      issues: [{ code: "invalid_item", path: ["articles", "field"], modifier: "optional" }],
    },
    {
      name: "invalid_item field id",
      field: () => list(object({ a: text(), id: text().optional() })),
      issues: [{ code: "invalid_item", path: ["articles", "field"], field: "id" }],
    },
    {
      name: "invalid_item on an item of an item appends nothing for either list",
      field: () => list(list(text().optional())),
      issues: [{ code: "invalid_item", path: ["articles", "field"], modifier: "optional" }],
    },
    {
      name: "invalid_blocks empty",
      field: () => blocks({}),
      issues: [{ code: "invalid_blocks", path: ["articles", "field"], reason: "empty" }],
    },
    {
      name: "invalid_blocks not_object",
      field: () => blocks({ hero: list(text()) as never }),
      issues: [
        {
          code: "invalid_blocks",
          path: ["articles", "field"],
          reason: "not_object",
          variant: "hero",
        },
      ],
    },
    {
      name: "invalid_blocks modifier optional",
      field: () => blocks({ hero: hero().optional() }),
      issues: [
        {
          code: "invalid_blocks",
          path: ["articles", "field"],
          reason: "modifier",
          variant: "hero",
        },
      ],
    },
    {
      name: "invalid_blocks modifier nullable",
      field: () => blocks({ hero: hero().nullable() }),
      issues: [
        {
          code: "invalid_blocks",
          path: ["articles", "field"],
          reason: "modifier",
          variant: "hero",
        },
      ],
    },
    {
      name: "invalid_blocks modifier default",
      field: () => blocks({ hero: hero().default({ heading: "x" }) }),
      issues: [
        {
          code: "invalid_blocks",
          path: ["articles", "field"],
          reason: "modifier",
          variant: "hero",
        },
      ],
    },
    {
      name: "invalid_blocks reserved_field type",
      field: () => blocks({ hero: object({ type: text() }) }),
      issues: [
        {
          code: "invalid_blocks",
          path: ["articles", "field"],
          reason: "reserved_field",
          variant: "hero",
          field: "type",
        },
      ],
    },
    {
      name: "invalid_blocks reserved_field id",
      field: () => blocks({ hero: object({ heading: text(), id: text() }) }),
      issues: [
        {
          code: "invalid_blocks",
          path: ["articles", "field"],
          reason: "reserved_field",
          variant: "hero",
          field: "id",
        },
      ],
    },
    {
      name: "invalid_blocks for several variants in declaration order",
      field: () =>
        blocks({
          b: text() as never,
          a: object({ id: text() }),
          c: object({}).nullable(),
          d: object({}),
        }),
      issues: [
        { code: "invalid_blocks", path: ["articles", "field"], reason: "not_object", variant: "b" },
        {
          code: "invalid_blocks",
          path: ["articles", "field"],
          reason: "reserved_field",
          variant: "a",
          field: "id",
        },
        { code: "invalid_blocks", path: ["articles", "field"], reason: "modifier", variant: "c" },
      ],
    },
    {
      name: "unknown_collection single",
      field: () => reference("missing"),
      issues: [{ code: "unknown_collection", path: ["articles", "field"], collection: "missing" }],
    },
    {
      name: "unknown_collection with index",
      field: () => reference(["missing", "articles", "gone"]),
      issues: [
        {
          code: "unknown_collection",
          path: ["articles", "field"],
          collection: "missing",
          index: 0,
        },
        { code: "unknown_collection", path: ["articles", "field"], collection: "gone", index: 2 },
      ],
    },
    {
      name: "invalid_references empty",
      field: () => reference([] as never),
      issues: [{ code: "invalid_references", path: ["articles", "field"], reason: "empty" }],
    },
    {
      name: "invalid_references duplicate",
      field: () => reference(["articles", "articles"]),
      issues: [
        { code: "invalid_references", path: ["articles", "field"], reason: "duplicate", index: 1 },
      ],
    },
    {
      name: "unsupported_unique on an object field",
      field: () => object({ slug: text().unique() }),
      issues: [{ code: "unsupported_unique", path: ["articles", "field", "slug"] }],
    },
    {
      name: "unsupported_unique on an item of an item",
      field: () => list(list(text().unique())),
      issues: [{ code: "unsupported_unique", path: ["articles", "field"] }],
    },
    {
      name: "unsupported_unique on a variant field",
      field: () => blocks({ hero: object({ slug: text().unique() }) }),
      issues: [{ code: "unsupported_unique", path: ["articles", "field", "hero", "slug"] }],
    },
    {
      name: "unknown_editor on a nested boolean",
      field: () => object({ flag: boolean().editor("textarea" as never) }),
      issues: [{ code: "unknown_editor", path: ["articles", "field", "flag"], editor: "textarea" }],
    },
    {
      name: "unknown_editor on a list item",
      field: () => list(text().editor("switch" as never)),
      issues: [{ code: "unknown_editor", path: ["articles", "field"], editor: "switch" }],
    },
  ];

  for (const entry of cases) {
    test(entry.name, () => {
      expectSchemaError(() => compileCollection({ field: entry.field() }), entry.issues);
    });
  }
});

describe("invalid_definition inside composites", () => {
  test("a non-declaration object field is invalid_definition expected field at its path", () => {
    expectSchemaError(
      () => compileCollection({ seo: object({ a: 5 as never }) }),
      [
        {
          code: "invalid_definition",
          path: ["articles", "seo", "a"],
          expected: "field",
          received: "number",
        },
      ],
    );
  });

  test("a malformed object field map is invalid_definition expected record", () => {
    expectSchemaError(
      () => compileCollection({ seo: object(5 as never) }),
      [
        {
          code: "invalid_definition",
          path: ["articles", "seo"],
          expected: "record",
          received: "number",
        },
      ],
    );
  });

  test("a non-declaration list item is invalid_definition expected field at the list path", () => {
    expectSchemaError(
      () => compileCollection({ tags: list(5 as never) }),
      [
        {
          code: "invalid_definition",
          path: ["articles", "tags"],
          expected: "field",
          received: "number",
        },
      ],
    );
  });

  test("a non-declaration block variant is invalid_blocks reason not_object", () => {
    expectSchemaError(
      () => compileCollection({ layout: blocks({ hero: 5 as never }) }),
      [
        {
          code: "invalid_blocks",
          path: ["articles", "layout"],
          reason: "not_object",
          variant: "hero",
        },
      ],
    );
  });
});

describe("config paths", () => {
  test("object field names are appended", () => {
    expectSchemaError(
      () => compileCollection({ seo: object({ meta: object({ rank: number().min(2).max(1) }) }) }),
      [
        {
          code: "conflicting_bounds",
          path: ["articles", "seo", "meta", "rank"],
          minimum: 2,
          maximum: 1,
        },
      ],
    );
  });

  test("variant names then field names are appended", () => {
    expectSchemaError(
      () =>
        compileCollection({
          layout: blocks({ hero: object({ level: number().int().min(1.5) }) }),
        }),
      [{ code: "invalid_bound", path: ["articles", "layout", "hero", "level"], constraint: "min" }],
    );
  });

  test("nothing is appended for list items", () => {
    expectSchemaError(
      () => compileCollection({ scores: list(list(number().min(3).max(2))) }),
      [{ code: "conflicting_bounds", path: ["articles", "scores"], minimum: 3, maximum: 2 }],
    );
  });

  test("paths combine through lists, objects and variants", () => {
    expectSchemaError(
      () =>
        compileCollection({
          page: object({
            rows: list(blocks({ hero: object({ meta: object({ t: text().max(-1) }) }) })),
          }),
        }),
      [
        {
          code: "invalid_bound",
          path: ["articles", "page", "rows", "hero", "meta", "t"],
          constraint: "max",
        },
      ],
    );
  });

  test("independent nested issues follow declaration order across fields and collections", () => {
    expectSchemaError(
      () =>
        compileSchema({
          authors: collection({
            profile: object({ z: text().min(-1), a: number().max(1).min(2) }),
          }),
          articles: collection({
            rows: list(object({ slug: text().unique() })),
            author: reference("people"),
          }),
        }),
      [
        { code: "invalid_bound", path: ["authors", "profile", "z"], constraint: "min" },
        { code: "conflicting_bounds", path: ["authors", "profile", "a"], minimum: 2, maximum: 1 },
        { code: "unsupported_unique", path: ["articles", "rows", "slug"] },
        { code: "unknown_collection", path: ["articles", "author"], collection: "people" },
      ],
    );
  });
});

describe("schema issue precedence", () => {
  test("a parent's own issues precede its item's issues at the same path", () => {
    expectSchemaError(
      () => compileCollection({ scores: list(number().int().min(1.5)).min(5).max(1) }),
      [
        { code: "conflicting_bounds", path: ["articles", "scores"], minimum: 5, maximum: 1 },
        { code: "invalid_bound", path: ["articles", "scores"], constraint: "min" },
      ],
    );
  });

  test("an object's own issues precede its fields' issues", () => {
    expectSchemaError(
      () =>
        compileCollection({
          seo: object({ a: text().min(-1) })
            .nullable()
            .default(null)
            .default({ a: "x" }),
        }),
      [
        { code: "conflicting_defaults", path: ["articles", "seo"] },
        { code: "invalid_bound", path: ["articles", "seo", "a"], constraint: "min" },
      ],
    );
  });

  test("a blocks field's own issues precede its variants' field issues", () => {
    expectSchemaError(
      () =>
        compileCollection({
          layout: blocks({ hero: object({ t: text().min(-1) }) })
            .min(3)
            .max(2),
        }),
      [
        { code: "conflicting_bounds", path: ["articles", "layout"], minimum: 3, maximum: 2 },
        { code: "invalid_bound", path: ["articles", "layout", "hero", "t"], constraint: "min" },
      ],
    );
  });

  test("invalid_blocks ranks before conflicting_defaults", () => {
    expectSchemaError(
      () => compileCollection({ layout: blocks({}).nullable().default(null).default([]) }),
      [
        { code: "invalid_blocks", path: ["articles", "layout"], reason: "empty" },
        { code: "conflicting_defaults", path: ["articles", "layout"] },
      ],
    );
  });

  test("invalid_blocks ranks before invalid_bound and conflicting_bounds", () => {
    expectSchemaError(
      () => compileCollection({ layout: blocks({ hero: text() as never }).min(-1) }),
      [
        {
          code: "invalid_blocks",
          path: ["articles", "layout"],
          reason: "not_object",
          variant: "hero",
        },
        { code: "invalid_bound", path: ["articles", "layout"], constraint: "min" },
      ],
    );
    expectSchemaError(
      () => compileCollection({ layout: blocks({}).min(4).max(1) }),
      [
        { code: "invalid_blocks", path: ["articles", "layout"], reason: "empty" },
        { code: "conflicting_bounds", path: ["articles", "layout"], minimum: 4, maximum: 1 },
      ],
    );
  });

  test("list count bounds use nonnegative safe integers", () => {
    expectSchemaError(
      () => compileCollection({ tags: list(text()).min(-1).max(1.5) }),
      [
        { code: "invalid_bound", path: ["articles", "tags"], constraint: "min" },
        { code: "invalid_bound", path: ["articles", "tags"], constraint: "max" },
      ],
    );
  });
});

describe("composite defaults", () => {
  test("an object default is stored and described as validated output", () => {
    const articles = compiles({ seo: object({ a: text().default("x") }).default({}) });
    expectSuccess(articles.validate({}), { seo: { a: "x" } });
    expect(Reflect.get(articles.describe().fields.seo!, "default")).toEqual({ a: "x" });
  });

  test("nested object defaults inside a default are applied", () => {
    const articles = compiles({
      seo: object({ inner: object({ x: text().default("x") }), y: text().optional() }).default({
        inner: {},
      }),
    });
    expectSuccess(articles.validate({}), { seo: { inner: { x: "x" } } });
  });

  test("a list default stores normalized item output", () => {
    const articles = compiles({
      times: list(datetime()).default(["2026-02-14T09:00+11:00"]),
      zeros: list(number()).default([-0]),
    });
    const result = articles.validate({});
    expectSuccess(result, { times: ["2026-02-13T22:00:00.000Z"], zeros: [0] });
    expect(Object.is((result as unknown as { data: { zeros: number[] } }).data.zeros[0], 0)).toBe(
      true,
    );
    expect(Reflect.get(articles.describe().fields.times!, "default")).toEqual([
      "2026-02-13T22:00:00.000Z",
    ]);
  });

  test("row defaults inside a list default are applied per row", () => {
    const articles = compiles({
      rows: list(object({ a: text(), b: text().default("d") })).default([{ a: "1" }, { a: "2" }]),
    });
    expectSuccess(articles.validate({}), {
      rows: [
        { a: "1", b: "d" },
        { a: "2", b: "d" },
      ],
    });
  });

  test("block defaults inside a blocks default are applied per block", () => {
    const articles = compiles({
      layout: blocks({ quote: object({ text: text(), by: text().default("anon") }) }).default([
        { type: "quote", text: "a" },
      ]),
    });
    expectSuccess(articles.validate({}), { layout: [{ type: "quote", text: "a", by: "anon" }] });
  });

  test("object({}) and empty variants compile with defaults", () => {
    const articles = compiles({
      meta: object({}).default({}),
      layout: blocks({ divider: object({}) }).default([{ type: "divider" }]),
    });
    expectSuccess(articles.validate({}), { meta: {}, layout: [{ type: "divider" }] });
  });

  test("repeated defaults that are deep-equal ignoring key order do not conflict", () => {
    const articles = compiles({
      seo: object({ a: text(), b: text() }).default({ a: "1", b: "2" }).default({ b: "2", a: "1" }),
    });
    expectSuccess(articles.validate({}), { seo: { a: "1", b: "2" } });
  });

  test("repeated defaults that are equal after normalization do not conflict", () => {
    const articles = compiles({
      times: list(datetime())
        .default(["2026-02-14T09:00+11:00"])
        .default(["2026-02-13T22:00:00.000Z"]),
    });
    expectSuccess(articles.validate({}), { times: ["2026-02-13T22:00:00.000Z"] });
  });

  test("repeated defaults that differ deeply conflict", () => {
    expectSchemaError(
      () =>
        compileCollection({
          seo: object({ tags: list(text()) })
            .default({ tags: ["a"] })
            .default({ tags: ["a", "b"] }),
        }),
      [{ code: "conflicting_defaults", path: ["articles", "seo"] }],
    );
  });

  test("defaults are deep-copied at declaration", () => {
    const value = { a: "x", tags: ["one"] };
    const declared = object({ a: text(), tags: list(text()) }).default(value);
    value.a = "changed";
    value.tags.push("two");
    const articles = compiles({ seo: declared });
    value.tags.push("three");
    expectSuccess(articles.validate({}), { seo: { a: "x", tags: ["one"] } });
  });

  test("declaring and compiling a default never invokes its getters", () => {
    let reads = 0;
    const value = Object.defineProperty({}, "a", {
      enumerable: true,
      get() {
        reads++;
        return "x";
      },
    });
    const declared = object({ a: text() }).default(value as { a: string });
    expect(reads).toBe(0);
    expectSuccess(compiles({ seo: object({ a: text() }).default({ a: "x" }) }).validate({}), {
      seo: { a: "x" },
    });
    expectInvalidDefaultWithOpenCauses(
      () => compileCollection({ seo: declared }),
      ["articles", "seo"],
    );
    expect(reads).toBe(0);
  });

  test("an invalid object default reports causes at collection and nested field paths", () => {
    expectSchemaError(
      () => compileCollection({ seo: object({ a: text() }).default({} as never) }),
      [
        {
          code: "invalid_default",
          path: ["articles", "seo"],
          causes: [{ code: "required", path: ["articles", "seo", "a"] }],
        },
      ],
    );
    expectSchemaError(
      () => compileCollection({ seo: object({ a: text() }).default({ a: "x", z: "y" } as never) }),
      [
        {
          code: "invalid_default",
          path: ["articles", "seo"],
          causes: [{ code: "unknown_field", path: ["articles", "seo", "z"] }],
        },
      ],
    );
  });

  test("an invalid list default reports causes at item paths", () => {
    expectSchemaError(
      () => compileCollection({ tags: list(text().max(1)).default(["a", "ab"]) }),
      [
        {
          code: "invalid_default",
          path: ["articles", "tags"],
          causes: [
            {
              code: "too_long",
              path: ["articles", "tags", 1],
              maximum: 1,
              actual: 2,
              unit: "graphemes",
            },
          ],
        },
      ],
    );
  });

  test("an invalid blocks default reports causes at block paths", () => {
    expectSchemaError(
      () =>
        compileCollection({
          layout: blocks({ hero: hero() }).default([{ type: "video" }] as never),
        }),
      [
        {
          code: "invalid_default",
          path: ["articles", "layout"],
          causes: [
            { code: "invalid_block_type", path: ["articles", "layout", 0], allowed: ["hero"] },
          ],
        },
      ],
    );
  });

  test("a nested field default is checked at its own path", () => {
    expectSchemaError(
      () => compileCollection({ seo: object({ a: text().min(3).default("x") }) }),
      [
        {
          code: "invalid_default",
          path: ["articles", "seo", "a"],
          causes: [
            {
              code: "too_short",
              path: ["articles", "seo", "a"],
              minimum: 3,
              actual: 1,
              unit: "graphemes",
            },
          ],
        },
      ],
    );
  });

  test("a parent default is not checked when a child declaration failed", () => {
    expectSchemaError(
      () =>
        compileCollection({
          seo: object({ a: number().min(2).max(1) }).default({ a: "x" } as never),
        }),
      [{ code: "conflicting_bounds", path: ["articles", "seo", "a"], minimum: 2, maximum: 1 }],
    );
    expectSchemaError(
      () =>
        compileCollection({
          seo: object({ a: text().min(3).default("x") }).default({ a: "y" }),
        }),
      [
        {
          code: "invalid_default",
          path: ["articles", "seo", "a"],
          causes: [
            {
              code: "too_short",
              path: ["articles", "seo", "a"],
              minimum: 3,
              actual: 1,
              unit: "graphemes",
            },
          ],
        },
      ],
    );
  });

  test("E11: a blocks default containing an id is invalid_default", () => {
    expectSuccess(
      compiles({
        layout: blocks({ hero: hero() }).default([{ type: "hero", heading: "Hi" }]),
      }).validate({}),
      { layout: [{ type: "hero", heading: "Hi" }] },
    );
    expectInvalidDefaultWithOpenCauses(
      () =>
        compileCollection({
          layout: blocks({ hero: hero() }).default([{ type: "hero", id: "b1", heading: "Hi" }]),
        }),
      ["articles", "layout"],
    );
  });

  test("a list-of-objects default containing a row id is invalid_default", () => {
    expectSuccess(
      compiles({ rows: list(object({ a: text() })).default([{ a: "x" }]) }).validate({}),
      { rows: [{ a: "x" }] },
    );
    expectInvalidDefaultWithOpenCauses(
      () =>
        compileCollection({ rows: list(object({ a: text() })).default([{ a: "x", id: "r1" }]) }),
      ["articles", "rows"],
    );
  });

  test("an object default containing a nested block id is invalid_default", () => {
    expectSuccess(
      compiles({
        page: object({ layout: blocks({ hero: hero() }) }).default({
          layout: [{ type: "hero", heading: "Hi" }],
        }),
      }).validate({}),
      { page: { layout: [{ type: "hero", heading: "Hi" }] } },
    );
    expectInvalidDefaultWithOpenCauses(
      () =>
        compileCollection({
          page: object({ layout: blocks({ hero: hero() }) }).default({
            layout: [{ type: "hero", id: "b1", heading: "Hi" }],
          }),
        }),
      ["articles", "page"],
    );
  });
});
