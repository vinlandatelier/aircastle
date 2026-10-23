import { beforeAll, describe, expect, test } from "bun:test";
import { compileCollection, requireSchemaApi, type RuntimeApi } from "../support/api.ts";
import { expectFailure, expectSuccess } from "../support/assertions.ts";

describe("strict text, bounds and Unicode", () => {
  let api: RuntimeApi;
  beforeAll(() => {
    api = requireSchemaApi();
  });

  const wrongTypes: [string, unknown][] = [
    ["number", 0],
    ["number", NaN],
    ["number", Infinity],
    ["boolean", false],
    ["bigint", 1n],
    ["symbol", Symbol("private")],
    ["function", () => "text"],
    ["array", []],
    ["object", {}],
    ["object", new String("text")],
    ["object", new Date(0)],
    ["object", new (class Value {})()],
  ];
  for (const [received, value] of wrongTypes) {
    test(`does not coerce ${received}: ${String(value)}`, () => {
      const collection = compileCollection(api, { title: api.text() });
      expectFailure(collection.validate({ title: value }), [
        {
          code: "invalid_type",
          path: ["title"],
          expected: "string",
          received: received as
            | "number"
            | "boolean"
            | "bigint"
            | "symbol"
            | "function"
            | "array"
            | "object",
        },
      ]);
    });
  }

  for (const value of [
    "",
    " a ",
    "\t",
    "\r\n",
    "<script>alert(1)</script>",
    '{"x":1}',
    "DROP TABLE posts;",
    "é",
    "e\u0301",
  ]) {
    test(`preserves text ${JSON.stringify(value)}`, () => {
      expectSuccess(compileCollection(api, { title: api.text() }).validate({ title: value }), {
        title: value,
      });
    });
  }

  test("plain text has no format-imposed character maximum", () => {
    const value = "a".repeat(100_000);
    expectSuccess(compileCollection(api, { title: api.text() }).validate({ title: value }), {
      title: value,
    });
  });

  for (const [value, count] of [
    ["é", 1],
    ["e\u0301", 1],
    ["😀", 1],
    ["🇦🇺", 1],
    ["👨‍👩‍👧‍👦", 1],
    [" a ", 3],
    ["a\r\nb", 3],
  ] as const) {
    test(`counts and preserves ${JSON.stringify(value)} as ${count} graphemes`, () => {
      expectSuccess(
        compileCollection(api, { title: api.text().min(count).max(count) }).validate({
          title: value,
        }),
        { title: value },
      );
      expectFailure(
        compileCollection(api, { title: api.text().max(count - 1) }).validate({ title: value }),
        [
          {
            code: "too_long",
            path: ["title"],
            maximum: count - 1,
            actual: count,
            unit: "graphemes",
          },
        ],
      );
    });
  }

  test("bounds are inclusive at both ends", () => {
    const collection = compileCollection(api, { title: api.text().min(2).max(4) });
    for (const title of ["aa", "aaa", "aaaa"])
      expectSuccess(collection.validate({ title }), { title });
    expectFailure(collection.validate({ title: "a" }), [
      { code: "too_short", path: ["title"], minimum: 2, actual: 1, unit: "graphemes" },
    ]);
    expectFailure(collection.validate({ title: "aaaaa" }), [
      { code: "too_long", path: ["title"], maximum: 4, actual: 5, unit: "graphemes" },
    ]);
  });

  test("zero is valid and whitespace contributes to length", () => {
    expectSuccess(
      compileCollection(api, { title: api.text().min(0).max(0) }).validate({ title: "" }),
      { title: "" },
    );
    expectFailure(compileCollection(api, { title: api.text().max(0) }).validate({ title: " " }), [
      { code: "too_long", path: ["title"], maximum: 0, actual: 1, unit: "graphemes" },
    ]);
    expectSuccess(compileCollection(api, { title: api.text().min(1) }).validate({ title: " " }), {
      title: " ",
    });
  });

  test("repeated bounds retain the strictest value in either order", () => {
    for (const field of [api.text().min(5).min(3), api.text().min(3).min(5)]) {
      expectFailure(compileCollection(api, { title: field }).validate({ title: "abcd" }), [
        { code: "too_short", path: ["title"], minimum: 5, actual: 4, unit: "graphemes" },
      ]);
    }
    for (const field of [api.text().max(3).max(5), api.text().max(5).max(3)]) {
      expectFailure(compileCollection(api, { title: field }).validate({ title: "abcd" }), [
        { code: "too_long", path: ["title"], maximum: 3, actual: 4, unit: "graphemes" },
      ]);
    }
  });

  for (const value of [
    "\uD800",
    "\uDC00",
    "x\uD800y",
    "\uDC00\uD800",
    "\uD800\uD800",
    "\uDC00\uDC00",
  ]) {
    test(`rejects malformed UTF-16 ${JSON.stringify(value)}`, () => {
      expectFailure(
        compileCollection(api, { title: api.text().min(10).email() }).validate({ title: value }),
        [{ code: "invalid_unicode", path: ["title"] }],
      );
    });
  }

  test("NUL is rejected without dependent failures", () => {
    expectFailure(
      compileCollection(api, { title: api.text().min(10).email() }).validate({ title: "a\u0000" }),
      [{ code: "invalid_character", path: ["title"] }],
    );
  });

  test("Unicode and NUL issues both appear, in order, without dependent failures", () => {
    expectFailure(
      compileCollection(api, { title: api.text().min(10).email() }).validate({
        title: "x\u0000\uD800",
      }),
      [
        { code: "invalid_unicode", path: ["title"] },
        { code: "invalid_character", path: ["title"] },
      ],
    );
  });

  for (const [suffix, code] of [
    ["\uD800", "invalid_unicode"],
    ["\u0000", "invalid_character"],
  ] as const) {
    test(`${code} diagnostics do not echo submitted text`, () => {
      const marker = "private-text-content-marker";
      const result = compileCollection(api, { title: api.text() }).validate({
        title: marker + suffix,
      });
      expectFailure(result, [{ code, path: ["title"] }]);
      expect(JSON.stringify(result)).not.toContain(marker);
    });
  }

  test("choices match exact strings and preserve declaration order in issues", () => {
    const collection = compileCollection(api, {
      title: api.text().oneOf(["published", "draft", "é", ""]),
    });
    for (const title of ["published", "draft", "é", ""])
      expectSuccess(collection.validate({ title }), { title });
    for (const title of ["Published", " draft", "e\u0301"])
      expectFailure(collection.validate({ title }), [
        {
          code: "invalid_choice",
          path: ["title"],
          allowed: ["published", "draft", "é", ""],
        },
      ]);
  });
});
