import { describe, expect, test } from "vite-plus/test";
import { boolean, list, number, object, text } from "../../src/index.ts";
import { compileCollection } from "../support/collections.ts";
import { compileValid } from "../support/compile-valid.ts";
import {
  expectFailure,
  expectOwnKeys,
  expectSchemaError,
  expectSuccess,
} from "../support/assertions.ts";

describe("object values", () => {
  const seo = () => object({ a: text(), b: text().default("x") });

  test("O1: nested defaults fill omitted fields of a present object", () => {
    expectSuccess(compileCollection({ seo: seo() }).validate({ seo: { a: "1" } }), {
      seo: { a: "1", b: "x" },
    });
  });

  test("supplied nested values are kept", () => {
    expectSuccess(compileCollection({ seo: seo() }).validate({ seo: { a: "1", b: "" } }), {
      seo: { a: "1", b: "" },
    });
  });

  test("O2: unknown nested fields are rejected in UTF-16 order at nested paths", () => {
    expectFailure(compileCollection({ seo: seo() }).validate({ seo: { a: "1", z: 1, y: 2 } }), [
      { code: "unknown_field", path: ["seo", "y"] },
      { code: "unknown_field", path: ["seo", "z"] },
    ]);
  });

  test.for([
    [[], "array"],
    ["x", "string"],
    [5, "number"],
    [false, "boolean"],
  ] as const)("O3: non-object %o is invalid_type expected object", ([value, received]) => {
    expectFailure(compileCollection({ seo: seo() }).validate({ seo: value }), [
      { code: "invalid_type", path: ["seo"], expected: "object", received },
    ]);
  });

  test("null on a non-nullable object is invalid_type expected object received null", () => {
    expectFailure(compileCollection({ seo: seo() }).validate({ seo: null }), [
      { code: "invalid_type", path: ["seo"], expected: "object", received: "null" },
    ]);
  });

  test("a missing required object is required", () => {
    expectFailure(compileCollection({ seo: seo() }).validate({}), [
      { code: "required", path: ["seo"] },
    ]);
  });

  test("nested fields are required by default", () => {
    expectFailure(compileCollection({ seo: seo() }).validate({ seo: {} }), [
      { code: "required", path: ["seo", "a"] },
    ]);
  });

  test("nested fields apply their own rules at nested paths", () => {
    const collection = compileCollection({
      seo: object({ slug: text().min(3), rank: number().int(), live: boolean() }),
    });
    expectFailure(collection.validate({ seo: { slug: "ab", rank: 1.5, live: "yes" } }), [
      { code: "too_short", path: ["seo", "slug"], minimum: 3, actual: 2, unit: "graphemes" },
      { code: "not_integer", path: ["seo", "rank"] },
      { code: "invalid_type", path: ["seo", "live"], expected: "boolean", received: "string" },
    ]);
  });

  test("nested optional and nullable fields follow text presence rules", () => {
    const collection = compileCollection({
      seo: object({ a: text().optional(), b: text().nullable() }),
    });
    expectSuccess(collection.validate({ seo: { b: null } }), { seo: { b: null } });
    expectSuccess(collection.validate({ seo: { a: undefined, b: "y" } }), { seo: { b: "y" } });
    const result = collection.validate({ seo: { a: undefined, b: "y" } });
    expectOwnKeys((result as unknown as { data: { seo: object } }).data.seo, ["b"]);
  });

  test("accepts null-prototype objects", () => {
    const value = Object.assign(Object.create(null), { a: "1" });
    expectSuccess(compileCollection({ seo: seo() }).validate({ seo: value }), {
      seo: { a: "1", b: "x" },
    });
  });

  test("O4: an omitted optional object is not created by its inner defaults", () => {
    const collection = compileCollection({
      seo: object({ b: text().default("x") }).optional(),
    });
    expectSuccess(collection.validate({}), {});
    expectSuccess(collection.validate({ seo: undefined }), {});
  });

  test("a null nullable object stays null despite inner defaults", () => {
    const collection = compileCollection({
      seo: object({ b: text().default("x") }).nullable(),
    });
    expectSuccess(collection.validate({ seo: null }), { seo: null });
  });

  test("a present optional object receives its inner defaults", () => {
    const collection = compileCollection({
      seo: object({ b: text().default("x") }).optional(),
    });
    expectSuccess(collection.validate({ seo: {} }), { seo: { b: "x" } });
  });

  test("mutating a returned object default does not change later validations", () => {
    const collection = compileValid({
      seo: object({ a: text(), tags: list(text()) }).default({ a: "x", tags: ["one"] }),
    });
    const first = collection.validate({});
    expectSuccess(first, { seo: { a: "x", tags: ["one"] } });
    const seo = (first as unknown as { data: { seo: { a: string; tags: string[] } } }).data.seo;
    seo.a = "changed";
    seo.tags.push("two");
    expectSuccess(collection.validate({}), { seo: { a: "x", tags: ["one"] } });
  });

  test("object({}) accepts an empty object and rejects any key", () => {
    const collection = compileCollection({ meta: object({}) });
    expectSuccess(collection.validate({ meta: {} }), { meta: {} });
    expectFailure(collection.validate({ meta: { a: 1 } }), [
      { code: "unknown_field", path: ["meta", "a"] },
    ]);
  });

  test("a field named id is an ordinary field in a plain object", () => {
    const collection = compileCollection({ meta: object({ id: text() }) });
    expectSuccess(collection.validate({ meta: { id: "" } }), { meta: { id: "" } });
    expectFailure(collection.validate({ meta: {} }), [{ code: "required", path: ["meta", "id"] }]);
  });

  test("a plain object without an id field rejects an id key", () => {
    expectFailure(compileCollection({ seo: seo() }).validate({ seo: { a: "1", id: "r" } }), [
      { code: "unknown_field", path: ["seo", "id"] },
    ]);
  });

  test("objects nest with paths through every level", () => {
    const collection = compileCollection({
      outer: object({ inner: object({ deep: object({ leaf: number().max(1) }) }) }),
    });
    expectFailure(collection.validate({ outer: { inner: { deep: { leaf: 2 } } } }), [
      { code: "too_large", path: ["outer", "inner", "deep", "leaf"], maximum: 1, actual: 2 },
    ]);
    expectSuccess(collection.validate({ outer: { inner: { deep: { leaf: 1 } } } }), {
      outer: { inner: { deep: { leaf: 1 } } },
    });
  });

  test("objects inside lists report row index then field", () => {
    const collection = compileCollection({ rows: list(object({ a: text() })) });
    expectFailure(collection.validate({ rows: [{ a: "x" }, { a: 1 }] }), [
      { code: "invalid_type", path: ["rows", 1, "a"], expected: "string", received: "number" },
    ]);
  });
});

describe("malformed objects", () => {
  test("O6: an accessor property is invalid_object at the object path without invoking it", () => {
    let reads = 0;
    const value = Object.defineProperty({ b: "y" }, "a", {
      enumerable: true,
      get() {
        reads++;
        return "1";
      },
    });
    const collection = compileCollection({
      seo: object({ a: text(), b: text().default("x") }),
    });
    expectFailure(collection.validate({ seo: value }), [{ code: "invalid_object", path: ["seo"] }]);
    expect(reads).toBe(0);
  });

  test("O6: a class instance is invalid_object at the object path", () => {
    class Seo {
      a = "1";
    }
    const collection = compileCollection({ seo: object({ a: text() }) });
    expectFailure(collection.validate({ seo: new Seo() }), [
      { code: "invalid_object", path: ["seo"] },
    ]);
  });

  test("a Date is invalid_object, not a valid object", () => {
    const collection = compileCollection({ seo: object({}) });
    expectFailure(collection.validate({ seo: new Date(0) }), [
      { code: "invalid_object", path: ["seo"] },
    ]);
  });

  for (const kind of ["symbol", "non-enumerable"] as const) {
    test(`a ${kind} own property is invalid_object`, () => {
      const value: Record<string, unknown> = { a: "1" };
      Object.defineProperty(value, kind === "symbol" ? Symbol("hidden") : "hidden", {
        value: "x",
        enumerable: kind === "symbol",
      });
      const collection = compileCollection({ seo: object({ a: text() }) });
      expectFailure(collection.validate({ seo: value }), [
        { code: "invalid_object", path: ["seo"] },
      ]);
    });
  }

  test("invalid_object stops the object while siblings are still checked", () => {
    class Seo {}
    const collection = compileCollection({ seo: object({ a: text() }), title: text() });
    expectFailure(collection.validate({ seo: new Seo(), title: 5 }), [
      { code: "invalid_object", path: ["seo"] },
      { code: "invalid_type", path: ["title"], expected: "string", received: "number" },
    ]);
  });
});

describe("unique inside composites", () => {
  test("O5: unique on an object field is unsupported_unique at the nested config path", () => {
    expectSchemaError(
      () => compileCollection({ seo: object({ a: text().unique() }) }),
      [{ code: "unsupported_unique", path: ["articles", "seo", "a"] }],
    );
  });

  test("unique on a field of an object item is unsupported_unique at the list path plus field", () => {
    expectSchemaError(
      () => compileCollection({ rows: list(object({ slug: text().unique() })) }),
      [{ code: "unsupported_unique", path: ["articles", "rows", "slug"] }],
    );
  });

  test("unique deeper than a direct list item is unsupported_unique", () => {
    expectSchemaError(
      () => compileCollection({ grid: list(list(text().unique())) }),
      [{ code: "unsupported_unique", path: ["articles", "grid"] }],
    );
  });
});
