import { describe, test } from "vite-plus/test";
import { boolean, type ReceivedType } from "../../src/index.ts";
import { compileCollection } from "../support/collections.ts";
import { compileValid } from "../support/compile-valid.ts";
import { expectFailure, expectSchemaError, expectSuccess } from "../support/assertions.ts";

const path = ["articles", "featured"];

describe("boolean values", () => {
  test("B1 accepts true and false unchanged", () => {
    const collection = compileValid({ featured: boolean() });
    expectSuccess(collection.validate({ featured: true }), { featured: true });
    expectSuccess(collection.validate({ featured: false }), { featured: false });
  });

  test("B2 rejects boolean-like values without coercion", () => {
    const collection = compileValid({ featured: boolean() });
    const cases: [unknown, ReceivedType][] = [
      ["true", "string"],
      [0, "number"],
      [1, "number"],
      [new Boolean(true), "object"],
    ];
    for (const [featured, received] of cases) {
      expectFailure(collection.validate({ featured }), [
        { code: "invalid_type", path: ["featured"], expected: "boolean", received },
      ]);
    }
  });

  test("rejects other near misses with their received types", () => {
    const collection = compileValid({ featured: boolean() });
    const cases: [unknown, ReceivedType][] = [
      ["false", "string"],
      ["", "string"],
      [new Boolean(false), "object"],
      [0n, "bigint"],
      [[true], "array"],
      [NaN, "number"],
    ];
    for (const [featured, received] of cases) {
      expectFailure(collection.validate({ featured }), [
        { code: "invalid_type", path: ["featured"], expected: "boolean", received },
      ]);
    }
  });

  test("a false default applies on omission and a supplied false is not replaced", () => {
    expectSuccess(compileValid({ featured: boolean().default(false) }).validate({}), {
      featured: false,
    });
    expectSuccess(
      compileValid({ featured: boolean().default(true) }).validate({ featured: false }),
      { featured: false },
    );
  });

  test("a supplied invalid value is not replaced by the default", () => {
    expectFailure(
      compileValid({ featured: boolean().default(false) }).validate({ featured: "false" }),
      [{ code: "invalid_type", path: ["featured"], expected: "boolean", received: "string" }],
    );
  });

  test("a string default is rejected at compilation", () => {
    expectSchemaError(
      () => compileCollection({ featured: boolean().default("true" as never) }),
      [
        {
          code: "invalid_default",
          path,
          causes: [{ code: "invalid_type", path, expected: "boolean", received: "string" }],
        },
      ],
    );
  });

  test("different repeated defaults conflict and equal ones do not", () => {
    expectSchemaError(
      () => compileCollection({ featured: boolean().default(true).default(false) }),
      [{ code: "conflicting_defaults", path }],
    );
    expectSuccess(
      compileValid({ featured: boolean().default(false).default(false) }).validate({}),
      { featured: false },
    );
  });
});
