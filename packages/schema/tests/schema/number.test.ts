import { describe, expect, test } from "vite-plus/test";
import { number, type ReceivedType } from "../../src/index.ts";
import { compileCollection } from "../support/collections.ts";
import { compileValid } from "../support/compile-valid.ts";
import { expectFailure, expectSchemaError, expectSuccess } from "../support/assertions.ts";

const path = ["articles", "rating"];

function outputOf(result: unknown, name: string): unknown {
  const settled = result as { ok: boolean; data?: Record<string, unknown> };
  expect(settled.ok).toBe(true);
  return settled.data?.[name];
}

describe("number values", () => {
  test("N1 accepts a fractional finite number unchanged", () => {
    expectSuccess(compileValid({ rating: number() }).validate({ rating: 4.5 }), {
      rating: 4.5,
    });
  });

  test("accepts zero, negatives, and the extreme finite numbers unchanged", () => {
    const collection = compileValid({ rating: number() });
    for (const rating of [
      0,
      -12.75,
      Number.MAX_VALUE,
      -Number.MAX_VALUE,
      Number.MIN_VALUE,
      Number.MAX_SAFE_INTEGER,
      2 ** 53,
    ]) {
      expectSuccess(collection.validate({ rating }), { rating });
    }
  });

  test("N2 rejects numeric strings without coercion", () => {
    const collection = compileValid({ rating: number() });
    for (const rating of ["5", "4.5", "", " 1 "]) {
      expectFailure(collection.validate({ rating }), [
        { code: "invalid_type", path: ["rating"], expected: "number", received: "string" },
      ]);
    }
  });

  test("N3 rejects NaN and infinities as invalid numbers that are received as number", () => {
    const collection = compileValid({ rating: number() });
    for (const rating of [NaN, Infinity, -Infinity]) {
      expectFailure(collection.validate({ rating }), [
        { code: "invalid_type", path: ["rating"], expected: "number", received: "number" },
      ]);
    }
  });

  test("rejects bigint, boxed numbers, booleans, arrays, and objects with their received types", () => {
    const collection = compileValid({ rating: number() });
    const cases: [unknown, ReceivedType][] = [
      [5n, "bigint"],
      [new Number(5), "object"],
      [true, "boolean"],
      [false, "boolean"],
      [[5], "array"],
      [{ value: 5 }, "object"],
    ];
    for (const [rating, received] of cases) {
      expectFailure(collection.validate({ rating }), [
        { code: "invalid_type", path: ["rating"], expected: "number", received },
      ]);
    }
  });

  test("N8 turns negative zero into positive zero", () => {
    const result = compileValid({ rating: number() }).validate({ rating: -0 });
    expectSuccess(result, { rating: 0 });
    expect(Object.is(outputOf(result, "rating"), 0)).toBe(true);
  });

  test("negative zero inside inclusive zero bounds also becomes positive zero", () => {
    const result = compileValid({ rating: number().int().min(0).max(0) }).validate({
      rating: -0,
    });
    expectSuccess(result, { rating: 0 });
    expect(Object.is(outputOf(result, "rating"), 0)).toBe(true);
  });
});

describe("integers", () => {
  test("N4 rejects a fraction", () => {
    expectFailure(compileValid({ rating: number().int() }).validate({ rating: 2.5 }), [
      { code: "not_integer", path: ["rating"] },
    ]);
  });

  test("N5 rejects integers beyond the safe range", () => {
    const collection = compileValid({ rating: number().int() });
    for (const rating of [2 ** 53, -(2 ** 53), 1e21, Number.MAX_VALUE]) {
      expectFailure(collection.validate({ rating }), [{ code: "not_integer", path: ["rating"] }]);
    }
  });

  test("accepts safe integers at both edges and zero", () => {
    const collection = compileValid({ rating: number().int() });
    for (const rating of [Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, 0, -7]) {
      expectSuccess(collection.validate({ rating }), { rating });
    }
  });

  test("still reports wrong types before integer checks", () => {
    const collection = compileValid({ rating: number().int() });
    expectFailure(collection.validate({ rating: "2" }), [
      { code: "invalid_type", path: ["rating"], expected: "number", received: "string" },
    ]);
    expectFailure(collection.validate({ rating: NaN }), [
      { code: "invalid_type", path: ["rating"], expected: "number", received: "number" },
    ]);
  });

  test("not_integer precedes a bound issue and both are reported", () => {
    const collection = compileValid({ rating: number().int().min(3).max(5) });
    expectFailure(collection.validate({ rating: 2.5 }), [
      { code: "not_integer", path: ["rating"] },
      { code: "too_small", path: ["rating"], minimum: 3, actual: 2.5 },
    ]);
    expectFailure(collection.validate({ rating: 5.5 }), [
      { code: "not_integer", path: ["rating"] },
      { code: "too_large", path: ["rating"], maximum: 5, actual: 5.5 },
    ]);
  });

  test("modifier order does not change the issue order", () => {
    const collection = compileValid({ rating: number().max(5).int() });
    expectFailure(collection.validate({ rating: 5.5 }), [
      { code: "not_integer", path: ["rating"] },
      { code: "too_large", path: ["rating"], maximum: 5, actual: 5.5 },
    ]);
  });
});

describe("number bounds", () => {
  test("N6 bounds are inclusive", () => {
    const collection = compileValid({ rating: number().min(1).max(5) });
    expectFailure(collection.validate({ rating: 0 }), [
      { code: "too_small", path: ["rating"], minimum: 1, actual: 0 },
    ]);
    expectSuccess(collection.validate({ rating: 1 }), { rating: 1 });
    expectSuccess(collection.validate({ rating: 5 }), { rating: 5 });
    expectFailure(collection.validate({ rating: 6 }), [
      { code: "too_large", path: ["rating"], maximum: 5, actual: 6 },
    ]);
  });

  test("N7 fractional bounds compare exactly", () => {
    const collection = compileValid({ rating: number().min(0.5) });
    expectFailure(collection.validate({ rating: 0.49 }), [
      { code: "too_small", path: ["rating"], minimum: 0.5, actual: 0.49 },
    ]);
    expectSuccess(collection.validate({ rating: 0.5 }), { rating: 0.5 });
  });

  test("negative bounds report negative details", () => {
    const collection = compileValid({ rating: number().min(-10).max(-5) });
    expectFailure(collection.validate({ rating: -10.5 }), [
      { code: "too_small", path: ["rating"], minimum: -10, actual: -10.5 },
    ]);
    expectFailure(collection.validate({ rating: -4 }), [
      { code: "too_large", path: ["rating"], maximum: -5, actual: -4 },
    ]);
    expectSuccess(collection.validate({ rating: -7.25 }), { rating: -7.25 });
  });

  test("equal minimum and maximum accept exactly that value", () => {
    const collection = compileValid({ rating: number().min(3).max(3) });
    expectSuccess(collection.validate({ rating: 3 }), { rating: 3 });
    expectFailure(collection.validate({ rating: 3.0001 }), [
      { code: "too_large", path: ["rating"], maximum: 3, actual: 3.0001 },
    ]);
  });

  test("repeated bounds tighten in either order", () => {
    for (const field of [number().min(1).min(3), number().min(3).min(1)]) {
      expectFailure(compileValid({ rating: field }).validate({ rating: 2 }), [
        { code: "too_small", path: ["rating"], minimum: 3, actual: 2 },
      ]);
    }
    for (const field of [number().max(5).max(3), number().max(3).max(5)]) {
      expectFailure(compileValid({ rating: field }).validate({ rating: 4 }), [
        { code: "too_large", path: ["rating"], maximum: 3, actual: 4 },
      ]);
    }
  });

  test("N9 an integer field rejects a fractional minimum", () => {
    expectSchemaError(
      () => compileCollection({ rating: number().int().min(1.5) }),
      [{ code: "invalid_bound", path, constraint: "min" }],
    );
  });

  test("an integer field rejects fractional or unsafe bounds regardless of modifier order", () => {
    expectSchemaError(
      () => compileCollection({ rating: number().max(2.5).int() }),
      [{ code: "invalid_bound", path, constraint: "max" }],
    );
    expectSchemaError(
      () =>
        compileCollection({
          rating: number()
            .int()
            .min(-(2 ** 53))
            .max(2 ** 53),
        }),
      [
        { code: "invalid_bound", path, constraint: "min" },
        { code: "invalid_bound", path, constraint: "max" },
      ],
    );
  });

  test("N10 a minimum above the maximum conflicts", () => {
    expectSchemaError(
      () => compileCollection({ rating: number().min(5).max(1) }),
      [{ code: "conflicting_bounds", path, minimum: 5, maximum: 1 }],
    );
  });

  test("N11 an integer field rejects a fractional default", () => {
    expectSchemaError(
      () => compileCollection({ rating: number().int().default(1.5) }),
      [{ code: "invalid_default", path, causes: [{ code: "not_integer", path }] }],
    );
  });
});
