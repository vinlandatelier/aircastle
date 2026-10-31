import { describe, expect, test } from "vite-plus/test";
import { json, type JsonValue } from "../../src/index.ts";
import { compileCollection } from "../support/collections.ts";
import { compileValid } from "../support/compile-valid.ts";
import { expectFailure, expectSchemaError, expectSuccess } from "../support/assertions.ts";

const path = ["articles", "data"];

function nestedArrays(levels: number): unknown {
  let value: unknown = [1];
  for (let level = 1; level < levels; level++) value = [value];
  return value;
}

function nestedObjects(levels: number): unknown {
  let value: unknown = { leaf: "x" };
  for (let level = 1; level < levels; level++) value = { a: value };
  return value;
}

function outputOf(result: unknown): unknown {
  const settled = result as { ok: boolean; data?: Record<string, unknown> };
  expect(settled.ok).toBe(true);
  return settled.data?.data;
}

describe("json values", () => {
  test("J1 accepts nested JSON and turns negative zero into zero", () => {
    const input = { a: [1, "x", true, null, { b: -0 }] as const };
    const result = compileValid({ data: json() }).validate({ data: input });
    expectSuccess(result, { data: { a: [1, "x", true, null, { b: 0 }] } });
    const output = outputOf(result) as { a: [number, string, boolean, null, { b: number }] };
    expect(Object.is(output.a[4].b, 0)).toBe(true);
    expect(Object.is(input.a[4].b, -0)).toBe(true);
  });

  test("accepts every top-level JSON value except null", () => {
    const collection = compileValid({ data: json() });
    for (const data of ["x", "", 0, 1.5, -3, true, false, [], {}, [null], { a: null }]) {
      expectSuccess(collection.validate({ data }), { data });
    }
  });

  test("top-level negative zero becomes zero", () => {
    const result = compileValid({ data: json() }).validate({ data: -0 });
    expectSuccess(result, { data: 0 });
    expect(Object.is(outputOf(result), 0)).toBe(true);
  });

  test("strings that look like other values stay strings", () => {
    const collection = compileValid({ data: json() });
    for (const data of ["5", "true", "null", "[1]", '{"a":1}']) {
      expectSuccess(collection.validate({ data }), { data });
    }
  });

  test("J2 rejects non-JSON values at their exact paths", () => {
    const collection = compileValid({ data: json() });
    const cases: [unknown, (string | number)[]][] = [
      [{ a: [1, undefined] }, ["data", "a", 1]],
      [{ a: NaN }, ["data", "a"]],
      [{ a: 1n }, ["data", "a"]],
      [new Date(), ["data"]],
    ];
    for (const [data, issuePath] of cases) {
      expectFailure(collection.validate({ data }), [{ code: "invalid_json", path: issuePath }]);
    }
  });

  test("rejects infinities, functions, symbols, undefined properties and class instances", () => {
    const collection = compileValid({ data: json() });
    const cases: [unknown, (string | number)[]][] = [
      [Infinity, ["data"]],
      [[-Infinity], ["data", 0]],
      [{ a: { b: () => 1 } }, ["data", "a", "b"]],
      [{ a: Symbol("s") }, ["data", "a"]],
      [{ a: undefined }, ["data", "a"]],
      [{ a: new Map() }, ["data", "a"]],
      [[new String("x")], ["data", 0]],
      [5n, ["data"]],
    ];
    for (const [data, issuePath] of cases) {
      expectFailure(collection.validate({ data }), [{ code: "invalid_json", path: issuePath }]);
    }
  });

  test("rejects a sparse array at the hole's path", () => {
    const sparse: unknown[] = [];
    sparse[1] = 1;
    expectFailure(compileValid({ data: json() }).validate({ data: { a: sparse } }), [
      { code: "invalid_json", path: ["data", "a", 0] },
    ]);
  });

  test("rejects an object with a symbol key", () => {
    const data = { a: 1, [Symbol("hidden")]: 2 };
    expectFailure(compileValid({ data: json() }).validate({ data }), [
      { code: "invalid_json", path: ["data"] },
    ]);
  });

  test("rejects an object with a non-enumerable own property", () => {
    const data = Object.defineProperty({ a: 1 }, "hidden", { value: 2, enumerable: false });
    expectFailure(compileValid({ data: json() }).validate({ data }), [
      { code: "invalid_json", path: ["data"] },
    ]);
  });

  test("reports every invalid nested value depth-first in key order", () => {
    expectFailure(
      compileValid({ data: json() }).validate({ data: { a: [1, undefined], b: NaN } }),
      [
        { code: "invalid_json", path: ["data", "a", 1] },
        { code: "invalid_json", path: ["data", "b"] },
      ],
    );
  });

  test("rejects accessor properties without invoking them", () => {
    let calls = 0;
    const data = {
      get a() {
        calls++;
        return 1;
      },
    };
    expectFailure(compileValid({ data: json() }).validate({ data }), [
      { code: "invalid_json", path: ["data", "a"] },
    ]);
    expect(calls).toBe(0);
  });

  test("J3 rejects a NUL character inside a string", () => {
    expectFailure(compileValid({ data: json() }).validate({ data: { a: "x\u0000" } }), [
      { code: "invalid_character", path: ["data", "a"] },
    ]);
  });

  test("rejects NUL and unpaired surrogates in strings at their paths", () => {
    const collection = compileValid({ data: json() });
    expectFailure(collection.validate({ data: "\u0000" }), [
      { code: "invalid_character", path: ["data"] },
    ]);
    expectFailure(collection.validate({ data: ["ok", "\uDC00"] }), [
      { code: "invalid_unicode", path: ["data", 1] },
    ]);
    expectFailure(collection.validate({ data: { a: { b: "x\uD800y" } } }), [
      { code: "invalid_unicode", path: ["data", "a", "b"] },
    ]);
  });

  test("keys with NUL or an unpaired surrogate fail at the parent object path", () => {
    const collection = compileValid({ data: json() });
    expectFailure(collection.validate({ data: { outer: { "a\u0000": 1 } } }), [
      { code: "invalid_character", path: ["data", "outer"] },
    ]);
    expectFailure(collection.validate({ data: { "\uD800": 1 } }), [
      { code: "invalid_unicode", path: ["data"] },
    ]);
  });

  test("J4 a top-level null needs nullable", () => {
    expectFailure(compileValid({ data: json() }).validate({ data: null }), [
      { code: "invalid_type", path: ["data"], expected: "json", received: "null" },
    ]);
    expectSuccess(compileValid({ data: json().nullable() }).validate({ data: null }), {
      data: null,
    });
  });
});

describe("json depth", () => {
  test("E7 accepts 64 levels of arrays or objects", () => {
    const collection = compileValid({ data: json() });
    for (const data of [nestedArrays(64), nestedObjects(64)]) {
      expectSuccess(collection.validate({ data }), { data: data as JsonValue });
    }
  });

  test("E7 rejects the 65th level of arrays at its path", () => {
    expectFailure(compileValid({ data: json() }).validate({ data: nestedArrays(65) }), [
      { code: "invalid_json", path: ["data", ...Array<number>(64).fill(0)] },
    ]);
  });

  test("E7 rejects the 65th level of objects at its path", () => {
    expectFailure(compileValid({ data: json() }).validate({ data: nestedObjects(65) }), [
      { code: "invalid_json", path: ["data", ...Array<string>(64).fill("a")] },
    ]);
  });

  test("much deeper values report only the first path past the limit", () => {
    expectFailure(compileValid({ data: json() }).validate({ data: nestedArrays(5000) }), [
      { code: "invalid_json", path: ["data", ...Array<number>(64).fill(0)] },
    ]);
  });
});

describe("json defaults", () => {
  test("a default is stored as validated output", () => {
    const result = compileValid({ data: json().default({ a: -0 }) }).validate({});
    expectSuccess(result, { data: { a: 0 } });
    expect(Object.is((outputOf(result) as { a: number }).a, 0)).toBe(true);
  });

  test("a default is captured when declared", () => {
    const source = { tags: ["x"] };
    const field = json().default(source);
    source.tags.push("y");
    expectSuccess(compileValid({ data: field }).validate({}), { data: { tags: ["x"] } });
  });

  test("mutating a returned default does not change later validations", () => {
    const collection = compileValid({ data: json().default({ tags: ["x"] }) });
    const first = collection.validate({});
    expectSuccess(first, { data: { tags: ["x"] } });
    (outputOf(first) as { tags: string[] }).tags.push("changed");
    expectSuccess(collection.validate({}), { data: { tags: ["x"] } });
  });

  test("an undefined default is invalid with expected json", () => {
    expectSchemaError(
      () => compileCollection({ data: json().default(undefined as never) }),
      [
        {
          code: "invalid_default",
          path,
          causes: [{ code: "invalid_type", path, expected: "json", received: "undefined" }],
        },
      ],
    );
  });

  test("a null default without nullable is invalid", () => {
    expectSchemaError(
      () => compileCollection({ data: json().default(null as never) }),
      [
        {
          code: "invalid_default",
          path,
          causes: [{ code: "invalid_type", path, expected: "json", received: "null" }],
        },
      ],
    );
    expectSuccess(compileValid({ data: json().nullable().default(null) }).validate({}), {
      data: null,
    });
  });

  test("a default containing a non-JSON value is invalid at its nested path", () => {
    expectSchemaError(
      () => compileCollection({ data: json().default({ a: NaN }) }),
      [
        {
          code: "invalid_default",
          path,
          causes: [{ code: "invalid_json", path: ["articles", "data", "a"] }],
        },
      ],
    );
  });

  test("repeated defaults conflict unless deep-equal ignoring object key order", () => {
    expectSuccess(
      compileValid({
        data: json()
          .default({ a: 1, b: [1, 2] })
          .default({ b: [1, 2], a: 1 }),
      }).validate({}),
      { data: { a: 1, b: [1, 2] } },
    );
    expectSuccess(compileValid({ data: json().default(-0).default(0) }).validate({}), {
      data: 0,
    });
    expectSchemaError(
      () => compileCollection({ data: json().default({ a: 1 }).default({ a: 2 }) }),
      [{ code: "conflicting_defaults", path }],
    );
    expectSchemaError(
      () => compileCollection({ data: json().default([1, 2]).default([2, 1]) }),
      [{ code: "conflicting_defaults", path }],
    );
  });
});
