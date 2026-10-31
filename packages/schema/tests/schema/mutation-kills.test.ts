import { describe, expect, test } from "vite-plus/test";
import {
  blocks,
  boolean,
  collection,
  compileSchema,
  date,
  datetime,
  json,
  list,
  object,
  reference,
  SchemaError,
  text,
} from "../../src/index.ts";
import type { FieldDeclaration } from "../support/collections.ts";
import { compileCollection } from "../support/collections.ts";
import { compileValid } from "../support/compile-valid.ts";
import { expectFailure, expectSchemaError, expectSuccess } from "../support/assertions.ts";

function articlesWith(fields: Readonly<Record<string, FieldDeclaration>>) {
  return compileSchema({
    authors: collection({ name: text() }),
    articles: collection(fields),
  }).articles;
}

function thrownBy(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  return undefined;
}

function expectWellFormedIssues(issues: unknown): void {
  expect(Array.isArray(issues)).toBe(true);
  const list = issues as readonly Record<string, unknown>[];
  expect(list.length).toBeGreaterThan(0);
  for (const issue of list) {
    expect(typeof issue.code).toBe("string");
    expect((issue.code as string).length).toBeGreaterThan(0);
    expect(typeof issue.message).toBe("string");
    expect((issue.message as string).trim().length).toBeGreaterThan(0);
    expect(Array.isArray(issue.path)).toBe(true);
  }
}

function expectInvalidDefaultWithWellFormedCauses(
  action: () => unknown,
  path: readonly string[],
): void {
  const thrown = thrownBy(action);
  expect(thrown).toBeInstanceOf(SchemaError);
  const issues = (thrown as SchemaError).issues as unknown as readonly Record<string, unknown>[];
  expect(issues).toHaveLength(1);
  expect(issues[0]!.code).toBe("invalid_default");
  expect(issues[0]!.path).toEqual(path);
  expectWellFormedIssues(issues[0]!.causes);
}

function arrayWithExtraKey(items: readonly unknown[], key: PropertyKey): unknown[] {
  const value = [...items];
  Object.defineProperty(value, key, { value: 1, enumerable: true, writable: true });
  return value;
}

describe("repeated defaults compare deeply after normalization", () => {
  const conflict = [{ code: "conflicting_defaults", path: ["articles", "data"] }] as const;

  test("an object default and a number default conflict", () => {
    expectSchemaError(() => compileCollection({ data: json().default({}).default(1) }), conflict);
    expectSchemaError(() => compileCollection({ data: json().default(1).default({}) }), conflict);
  });

  test("an object default and a null default conflict", () => {
    expectSchemaError(
      () => compileCollection({ data: json().nullable().default({}).default(null) }),
      conflict,
    );
  });

  test("an array default and an object default with the same keys conflict", () => {
    expectSchemaError(
      () => compileCollection({ data: json().default([]).default({ length: 0 }) }),
      conflict,
    );
  });

  test("an object default and an object default with an extra key conflict", () => {
    expectSchemaError(
      () => compileCollection({ data: json().default({}).default({ a: 1 }) }),
      conflict,
    );
  });
});

describe("structural declaration failures stop default checks", () => {
  test("a list with a non-declaration item does not check its default", () => {
    expectSchemaError(
      () => compileCollection({ tags: list(5 as never).default("x" as never) }),
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

  test("blocks with a malformed variant map report invalid_definition and skip the default", () => {
    expectSchemaError(
      () => compileCollection({ layout: blocks(5 as never) }),
      [
        {
          code: "invalid_definition",
          path: ["articles", "layout"],
          expected: "record",
          received: "number",
        },
      ],
    );
    expectSchemaError(
      () => compileCollection({ layout: blocks(5 as never).default("x" as never) }),
      [
        {
          code: "invalid_definition",
          path: ["articles", "layout"],
          expected: "record",
          received: "number",
        },
      ],
    );
  });

  test("blocks with a non-object variant do not check their default", () => {
    expectSchemaError(
      () => compileCollection({ layout: blocks({ hero: text() } as never).default("x" as never) }),
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

  test("a variant with a malformed field map is invalid_definition at the variant path", () => {
    expectSchemaError(
      () => compileCollection({ layout: blocks({ hero: object(5 as never) }) }),
      [
        {
          code: "invalid_definition",
          path: ["articles", "layout", "hero"],
          expected: "record",
          received: "number",
        },
      ],
    );
  });
});

describe("editor and uniqueness declarations", () => {
  test("a non-string boolean editor name is invalid_editor expected string", () => {
    expectSchemaError(
      () => compileCollection({ featured: boolean().editor(5 as never) }),
      [
        {
          code: "invalid_editor",
          path: ["articles", "featured"],
          expected: "string",
          received: "number",
        },
      ],
    );
  });

  test(".unique() on the item of a nested list is unsupported_unique", () => {
    expectSchemaError(
      () => compileCollection({ tags: list(list(text().unique())) }),
      [{ code: "unsupported_unique", path: ["articles", "tags"] }],
    );
  });

  test(".unique() on the direct item of a list inside an object is invalid_item", () => {
    expectSchemaError(
      () => compileCollection({ seo: object({ tags: list(text().unique()) }) }),
      [{ code: "invalid_item", path: ["articles", "seo", "tags"], modifier: "unique" }],
    );
  });
});

describe("reference targets", () => {
  test("a schema entry that is not a collection is not a reference target", () => {
    expectSchemaError(
      () =>
        compileSchema({
          articles: collection({ author: reference("bad") }),
          bad: 5 as never,
        }),
      [
        { code: "unknown_collection", path: ["articles", "author"], collection: "bad" },
        { code: "invalid_definition", path: ["bad"], expected: "collection", received: "number" },
      ],
    );
  });
});

describe("multi-reference values", () => {
  const articles = () => articlesWith({ author: reference(["authors"]) });

  test("reports unknown keys in UTF-16 order", () => {
    expectFailure(
      articles().validate({ author: { collection: "authors", id: "a1", z: 1, b: 2 } }),
      [
        { code: "unknown_field", path: ["author", "b"] },
        { code: "unknown_field", path: ["author", "z"] },
      ],
    );
  });

  test("a non-object value fails with issues instead of throwing", () => {
    const result = articles().validate({ author: "a1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expectWellFormedIssues(result.issues);
  });

  test("an empty id fails with well-formed issues", () => {
    const result = articles().validate({ author: { collection: "authors", id: "" } });
    expect(result.ok).toBe(false);
    if (!result.ok) expectWellFormedIssues(result.issues);
  });
});

describe("ids in declared defaults", () => {
  test("the invalid_default causes are well-formed validation issues", () => {
    expectInvalidDefaultWithWellFormedCauses(
      () =>
        compileCollection({
          layout: blocks({ hero: object({ heading: text() }) }).default([
            { type: "hero", id: "b1", heading: "Hi" },
          ]),
        }),
      ["articles", "layout"],
    );
  });
});

describe("list boundaries", () => {
  test("a hole is invalid_list even when an extra key keeps the key count", () => {
    const tags: unknown[] = [];
    tags[1] = "a";
    Object.assign(tags, { extra: "b" });
    expectFailure(compileValid({ tags: list(text()) }).validate({ tags }), [
      { code: "invalid_list", path: ["tags"] },
    ]);
  });
});

describe("date bounds", () => {
  test("an array naming a date is not a valid date bound", () => {
    expectSchemaError(
      () => compileCollection({ publishedOn: date().min(["2026-01-01"] as never) }),
      [{ code: "invalid_bound", path: ["articles", "publishedOn"], constraint: "min" }],
    );
  });

  test("an array naming a datetime is not a valid datetime bound", () => {
    expectSchemaError(
      () => compileCollection({ updatedAt: datetime().max(["2026-01-01T00:00Z"] as never) }),
      [{ code: "invalid_bound", path: ["articles", "updatedAt"], constraint: "max" }],
    );
  });
});

describe("json arrays", () => {
  test("accepts a dense array with more than ten elements", () => {
    const data = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    expectSuccess(compileValid({ data: json() }).validate({ data }), { data });
  });

  test("an array with an extra named property is invalid_json at its path", () => {
    expectFailure(
      compileValid({ data: json() }).validate({ data: { a: arrayWithExtraKey([1], "x") } }),
      [{ code: "invalid_json", path: ["data", "a"] }],
    );
  });

  test("an array with a non-canonical numeric key is invalid_json at its path", () => {
    expectFailure(
      compileValid({ data: json() }).validate({ data: arrayWithExtraKey([1, 2], "01") }),
      [{ code: "invalid_json", path: ["data"] }],
    );
  });

  test("an array with a key past the array index range is invalid_json at its path", () => {
    expectFailure(
      compileValid({ data: json() }).validate({ data: arrayWithExtraKey([1], "4294967295") }),
      [{ code: "invalid_json", path: ["data"] }],
    );
  });

  test("an array with a symbol key is invalid_json at its path", () => {
    expectFailure(
      compileValid({ data: json() }).validate({ data: arrayWithExtraKey([1], Symbol("extra")) }),
      [{ code: "invalid_json", path: ["data"] }],
    );
  });
});

describe("defaults are captured at declaration", () => {
  test("a null-prototype object default is copied", () => {
    const value = Object.assign(Object.create(null) as Record<string, string>, { a: "original" });
    const field = object({ a: text() }).default(value);
    value.a = "changed";
    expectSuccess(compileValid({ seo: field }).validate({}), { seo: { a: "original" } });
  });

  test("a cyclic default is an invalid default, not a declaration crash", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const thrown = thrownBy(() => compileCollection({ data: json().default(cyclic as never) }));
    expect(thrown).toBeInstanceOf(SchemaError);
    const issues = (thrown as SchemaError).issues;
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("invalid_default");
    expect(issues[0].path).toEqual(["articles", "data"]);
  });

  test("a default with a leading hole keeps the hole", () => {
    const leading: string[] = [];
    leading[1] = "a";
    expectSchemaError(
      () => compileCollection({ tags: list(text()).default(leading) }),
      [
        {
          code: "invalid_default",
          path: ["articles", "tags"],
          causes: [{ code: "invalid_list", path: ["articles", "tags"] }],
        },
      ],
    );
  });

  test("a default with a trailing hole keeps its length", () => {
    const trailing = ["a"];
    trailing.length = 2;
    expectSchemaError(
      () => compileCollection({ tags: list(text()).default(trailing) }),
      [
        {
          code: "invalid_default",
          path: ["articles", "tags"],
          causes: [{ code: "invalid_list", path: ["articles", "tags"] }],
        },
      ],
    );
  });

  test("a default with a non-enumerable property stays malformed", () => {
    const value = Object.defineProperty({}, "a", { value: "x", enumerable: false }) as {
      a: string;
    };
    expectSchemaError(
      () => compileCollection({ seo: object({ a: text() }).default(value) }),
      [
        {
          code: "invalid_default",
          path: ["articles", "seo"],
          causes: [{ code: "invalid_object", path: ["articles", "seo"] }],
        },
      ],
    );
  });
});
