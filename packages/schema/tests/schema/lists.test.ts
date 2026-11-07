import { describe, expect, test } from "vite-plus/test";
import { list, number, object, text } from "../../src/index.ts";
import { compileCollection } from "../support/collections.ts";
import { compileValid } from "../support/compile-valid.ts";
import {
  expectFailure,
  expectOwnKeys,
  expectSchemaError,
  expectSuccess,
} from "../support/assertions.ts";

describe("list values", () => {
  test("L1: a required list accepts an empty array", () => {
    expectSuccess(compileCollection({ tags: list(text()) }).validate({ tags: [] }), { tags: [] });
  });

  test("accepts plain arrays and returns each validated element in order", () => {
    expectSuccess(compileCollection({ tags: list(text()) }).validate({ tags: ["a", "", "b"] }), {
      tags: ["a", "", "b"],
    });
  });

  test.for([
    ["x", "string"],
    [5, "number"],
    [true, "boolean"],
    [{}, "object"],
    [{ 0: "a", length: 1 }, "object"],
  ] as const)("rejects non-array %o as invalid_type expected array", ([value, received]) => {
    expectFailure(compileCollection({ tags: list(text()) }).validate({ tags: value }), [
      { code: "invalid_type", path: ["tags"], expected: "array", received },
    ]);
  });

  test("a missing required list is required", () => {
    expectFailure(compileCollection({ tags: list(text()) }).validate({}), [
      { code: "required", path: ["tags"] },
    ]);
  });

  test("null on a non-nullable list is invalid_type expected array received null", () => {
    expectFailure(compileCollection({ tags: list(text()) }).validate({ tags: null }), [
      { code: "invalid_type", path: ["tags"], expected: "array", received: "null" },
    ]);
  });

  test("optional and nullable lists follow text presence rules", () => {
    expectSuccess(compileCollection({ tags: list(text()).optional() }).validate({}), {});
    expectSuccess(
      compileCollection({ tags: list(text()).optional() }).validate({ tags: undefined }),
      {},
    );
    expectSuccess(compileCollection({ tags: list(text()).nullable() }).validate({ tags: null }), {
      tags: null,
    });
  });

  test("a list default applies when the list is omitted", () => {
    let collection: ReturnType<typeof compileCollection> | undefined;
    expect(() => {
      collection = compileCollection({ tags: list(text()).default(["news"]) });
    }).not.toThrow();
    expectSuccess(collection!.validate({}), { tags: ["news"] });
    expectSuccess(collection!.validate({ tags: undefined }), { tags: ["news"] });
    expectSuccess(collection!.validate({ tags: [] }), { tags: [] });
  });

  test("mutating a returned list default does not change later validations", () => {
    const collection = compileValid({ tags: list(text()).default(["news"]) });
    const first = collection.validate({});
    expectSuccess(first, { tags: ["news"] });
    (first as unknown as { data: { tags: string[] } }).data.tags.push("changed");
    expectSuccess(collection.validate({}), { tags: ["news"] });
  });

  test("L2: min(1) rejects an empty list with too_few", () => {
    expectFailure(compileCollection({ tags: list(text()).min(1) }).validate({ tags: [] }), [
      { code: "too_few", path: ["tags"], minimum: 1, actual: 0 },
    ]);
  });

  test("max(n) rejects longer lists with too_many", () => {
    expectFailure(
      compileCollection({ tags: list(text()).max(2) }).validate({ tags: ["a", "b", "c"] }),
      [{ code: "too_many", path: ["tags"], maximum: 2, actual: 3 }],
    );
  });

  test("count bounds are inclusive", () => {
    const collection = compileCollection({ tags: list(text()).min(2).max(3) });
    expectSuccess(collection.validate({ tags: ["a", "b"] }), { tags: ["a", "b"] });
    expectSuccess(collection.validate({ tags: ["a", "b", "c"] }), { tags: ["a", "b", "c"] });
    expectFailure(collection.validate({ tags: ["a"] }), [
      { code: "too_few", path: ["tags"], minimum: 2, actual: 1 },
    ]);
    expectFailure(collection.validate({ tags: ["a", "b", "c", "d"] }), [
      { code: "too_many", path: ["tags"], maximum: 3, actual: 4 },
    ]);
  });

  test("repeated count bounds tighten", () => {
    const collection = compileCollection({ tags: list(text()).max(3).max(1).min(0) });
    expectFailure(collection.validate({ tags: ["a", "b"] }), [
      { code: "too_many", path: ["tags"], maximum: 1, actual: 2 },
    ]);
  });

  test("L3: item issues carry the item index in ascending order", () => {
    const collection = compileCollection({ tags: list(text().max(3)) });
    expectFailure(collection.validate({ tags: ["ok", 7, "toolong"] }), [
      { code: "invalid_type", path: ["tags", 1], expected: "string", received: "number" },
      { code: "too_long", path: ["tags", 2], maximum: 3, actual: 7, unit: "graphemes" },
    ]);
  });

  test("L4: a sparse array is invalid_list and stops at the list path", () => {
    const sparse: unknown[] = [];
    sparse[1] = "a";
    expectFailure(compileCollection({ tags: list(text()) }).validate({ tags: sparse }), [
      { code: "invalid_list", path: ["tags"] },
    ]);
  });

  test("L4: an array with an extra own property is invalid_list and stops at the list path", () => {
    const extra = Object.assign(["a", 5], { note: "x" });
    expectFailure(compileCollection({ tags: list(text()) }).validate({ tags: extra }), [
      { code: "invalid_list", path: ["tags"] },
    ]);
  });

  test("L6: nullable items accept null", () => {
    expectSuccess(
      compileCollection({ tags: list(text().nullable()) }).validate({ tags: [null, "a"] }),
      { tags: [null, "a"] },
    );
  });

  test("non-nullable items reject null", () => {
    expectFailure(compileCollection({ tags: list(text()) }).validate({ tags: ["a", null] }), [
      { code: "invalid_type", path: ["tags", 1], expected: "string", received: "null" },
    ]);
  });

  test("L7: nested list issues use both indices", () => {
    expectFailure(
      compileCollection({ grid: list(list(number())) }).validate({ grid: [[1], [2, "x"]] }),
      [{ code: "invalid_type", path: ["grid", 1, 1], expected: "number", received: "string" }],
    );
  });

  test("nested lists return validated nested arrays", () => {
    expectSuccess(
      compileCollection({ grid: list(list(number())) }).validate({ grid: [[1, 2], [], [3]] }),
      { grid: [[1, 2], [], [3]] },
    );
  });
});

describe("list item declarations", () => {
  test("L5: an optional item invalidates the schema with invalid_item", () => {
    expectSchemaError(
      () => compileCollection({ tags: list(text().optional()) }),
      [{ code: "invalid_item", path: ["articles", "tags"], modifier: "optional" }],
    );
  });

  test("a defaulted item invalidates the schema with invalid_item", () => {
    expectSchemaError(
      () => compileCollection({ tags: list(text().default("x")) }),
      [{ code: "invalid_item", path: ["articles", "tags"], modifier: "default" }],
    );
  });

  test("a unique item gives exactly one invalid_item", () => {
    expectSchemaError(
      () => compileCollection({ tags: list(text().unique()) }),
      [{ code: "invalid_item", path: ["articles", "tags"], modifier: "unique" }],
    );
  });

  test("L9: an object item declaring id invalidates the schema with invalid_item", () => {
    expectSchemaError(
      () => compileCollection({ rows: list(object({ id: text() })) }),
      [{ code: "invalid_item", path: ["articles", "rows"], field: "id" }],
    );
  });

  test("any declaration may be an item, including lists and objects", () => {
    const collection = compileCollection({
      matrix: list(list(text())),
      rows: list(object({ a: text() })),
    });
    expectSuccess(collection.validate({ matrix: [["a"], []], rows: [{ a: "x" }] }), {
      matrix: [["a"], []],
      rows: [{ a: "x" }],
    });
  });
});

describe("list of object rows", () => {
  test("L8 validation side: validate keeps a supplied row id and adds none", () => {
    const collection = compileCollection({ rows: list(object({ a: text() })) });
    const result = collection.validate({ rows: [{ a: "x" }, { a: "y", id: "r1" }] });
    expectSuccess(result, { rows: [{ a: "x" }, { a: "y", id: "r1" }] });
    const rows = (result as unknown as { data: { rows: object[] } }).data.rows;
    expectOwnKeys(rows[0]!, ["a"]);
    expectOwnKeys(rows[1]!, ["a", "id"]);
  });

  test("an explicit undefined row id is treated as omitted", () => {
    const collection = compileCollection({ rows: list(object({ a: text() })) });
    const result = collection.validate({ rows: [{ a: "x", id: undefined }] });
    expectSuccess(result, { rows: [{ a: "x" }] });
    const rows = (result as unknown as { data: { rows: object[] } }).data.rows;
    expectOwnKeys(rows[0]!, ["a"]);
  });

  test("L10: duplicate row ids fail at the later row's id with the first index", () => {
    const collection = compileCollection({ rows: list(object({ a: text() })) });
    expectFailure(
      collection.validate({
        rows: [
          { a: "x", id: "r" },
          { a: "y", id: "r" },
        ],
      }),
      [{ code: "duplicate_id", path: ["rows", 1, "id"], firstIndex: 0 }],
    );
  });

  test("every repeat of a row id points at the first occurrence", () => {
    const collection = compileCollection({ rows: list(object({ a: text() })) });
    expectFailure(
      collection.validate({
        rows: [
          { a: "1", id: "r" },
          { a: "2", id: "s" },
          { a: "3", id: "r" },
          { a: "4", id: "s" },
          { a: "5", id: "r" },
        ],
      }),
      [
        { code: "duplicate_id", path: ["rows", 2, "id"], firstIndex: 0 },
        { code: "duplicate_id", path: ["rows", 3, "id"], firstIndex: 1 },
        { code: "duplicate_id", path: ["rows", 4, "id"], firstIndex: 0 },
      ],
    );
  });

  test("ids are compared within one list only", () => {
    const collection = compileCollection({
      first: list(object({ a: text() })),
      second: list(object({ a: text() })),
    });
    expectSuccess(
      collection.validate({ first: [{ a: "x", id: "r" }], second: [{ a: "y", id: "r" }] }),
      { first: [{ a: "x", id: "r" }], second: [{ a: "y", id: "r" }] },
    );
  });

  test.for([
    [5, "number"],
    [null, "null"],
    [true, "boolean"],
    [{}, "object"],
  ] as const)("a non-string row id %o is invalid_type expected string", ([id, received]) => {
    const collection = compileCollection({ rows: list(object({ a: text() })) });
    expectFailure(collection.validate({ rows: [{ a: "x", id }] }), [
      { code: "invalid_type", path: ["rows", 0, "id"], expected: "string", received },
    ]);
  });

  test("an empty row id is invalid_id", () => {
    const collection = compileCollection({ rows: list(object({ a: text() })) });
    expectFailure(collection.validate({ rows: [{ a: "x", id: "" }] }), [
      { code: "invalid_id", path: ["rows", 0, "id"] },
    ]);
  });

  test("any other row id string is kept unchanged", () => {
    const collection = compileCollection({ rows: list(object({ a: text() })) });
    expectSuccess(collection.validate({ rows: [{ a: "x", id: " Mixed Case 1 " }] }), {
      rows: [{ a: "x", id: " Mixed Case 1 " }],
    });
  });

  test("row ids apply invalid_unicode then invalid_character", () => {
    const collection = compileCollection({ rows: list(object({ a: text() })) });
    expectFailure(collection.validate({ rows: [{ a: "x", id: "r\u0000" }] }), [
      { code: "invalid_character", path: ["rows", 0, "id"] },
    ]);
    expectFailure(collection.validate({ rows: [{ a: "x", id: "r\uD800" }] }), [
      { code: "invalid_unicode", path: ["rows", 0, "id"] },
    ]);
    expectFailure(collection.validate({ rows: [{ a: "x", id: "\uD800\u0000" }] }), [
      { code: "invalid_unicode", path: ["rows", 0, "id"] },
      { code: "invalid_character", path: ["rows", 0, "id"] },
    ]);
  });

  test("row fields follow object rules at row paths", () => {
    const collection = compileCollection({ rows: list(object({ a: text() })) });
    expectFailure(collection.validate({ rows: [{ a: "x" }, {}, { a: "y", z: 1 }, "x"] }), [
      { code: "required", path: ["rows", 1, "a"] },
      { code: "unknown_field", path: ["rows", 2, "z"] },
      { code: "invalid_type", path: ["rows", 3], expected: "object", received: "string" },
    ]);
  });

  test("nested defaults apply per row", () => {
    const collection = compileCollection({
      rows: list(object({ a: text(), b: text().default("d") })),
    });
    expectSuccess(collection.validate({ rows: [{ a: "1" }, { a: "2", b: "x" }, { a: "3" }] }), {
      rows: [
        { a: "1", b: "d" },
        { a: "2", b: "x" },
        { a: "3", b: "d" },
      ],
    });
  });

  test("validate accepts null for nullable rows and returns it unchanged", () => {
    const collection = compileCollection({ rows: list(object({ a: text() }).nullable()) });
    expectSuccess(collection.validate({ rows: [null, { a: "x" }] }), {
      rows: [null, { a: "x" }],
    });
  });

  test("a field named id inside a row's nested object is an ordinary field", () => {
    const collection = compileCollection({
      rows: list(object({ meta: object({ id: text() }) })),
    });
    expectSuccess(collection.validate({ rows: [{ meta: { id: "" } }] }), {
      rows: [{ meta: { id: "" } }],
    });
  });
});
