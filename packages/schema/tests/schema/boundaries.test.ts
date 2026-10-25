import { describe, expect, test } from "vite-plus/test";
import { text } from "../../src/index.ts";
import { compileCollection } from "../support/collections.ts";
import { expectFailure, expectSuccess } from "../support/assertions.ts";

describe("document boundary and diagnostic order", () => {
  test.for(
    [
      null,
      undefined,
      true,
      7,
      "text",
      [],
      1n,
      Symbol("root"),
      () => ({}),
      new Date(0),
      new (class Document {})(),
    ].map((value) => [value]),
  )("rejects non-document root %o", ([input]) => {
    expectFailure(compileCollection({ title: text() }).validate(input), [
      { code: "invalid_document", path: [] },
    ]);
  });

  test("accepts null-prototype documents with own enumerable data fields", () => {
    const input = Object.assign(Object.create(null), { title: "Hi" });
    expectSuccess(compileCollection({ title: text() }).validate(input), { title: "Hi" });
  });

  test("rejects inherited field getters without reading inherited values", () => {
    let reads = 0;
    const prototype = Object.defineProperty({}, "title", {
      enumerable: true,
      get() {
        reads++;
        throw new Error("Inherited value must not execute");
      },
    });
    const input = Object.create(prototype);
    expectFailure(compileCollection({ title: text() }).validate(input), [
      { code: "invalid_document", path: [] },
    ]);
    expect(reads).toBe(0);
  });

  test("a plain document must supply its own required field", () => {
    const name = "inheritedValueForSchemaTest";
    const collection = compileCollection({ [name]: text() });
    const previous = Object.getOwnPropertyDescriptor(Object.prototype, name);
    let reads = 0;
    let result: unknown;

    try {
      Object.defineProperty(Object.prototype, name, {
        configurable: true,
        get() {
          reads++;
          return "Inherited text";
        },
      });
      result = collection.validate({});
    } finally {
      if (previous) Object.defineProperty(Object.prototype, name, previous);
      else Reflect.deleteProperty(Object.prototype, name);
    }
    expectFailure(result, [{ code: "required", path: [name] }]);
    expect(reads).toBe(0);
  });

  test("rejects accessors without invoking getters", () => {
    let reads = 0;
    const input = Object.defineProperty({}, "title", {
      enumerable: true,
      get() {
        reads++;
        throw new Error("Must not execute");
      },
    });
    const result = compileCollection({ title: text() }).validate(input);
    expect(reads).toBe(0);
    expectFailure(result, [{ code: "invalid_document", path: [] }]);
  });

  for (const kind of ["symbol", "non-enumerable"] as const) {
    test(`rejects ${kind} own properties as an invalid document`, () => {
      const input: Record<string, unknown> = { title: "Hi" };
      Object.defineProperty(input, kind === "symbol" ? Symbol("hidden") : "hidden", {
        value: "x",
        enumerable: kind === "symbol",
      });
      const result = compileCollection({ title: text() }).validate(input);
      expectFailure(result, [{ code: "invalid_document", path: [] }]);
    });
  }

  test("unknown keys follow declared fields and sort independently of input insertion order", () => {
    const collection = compileCollection({
      title: text().min(10).email().oneOf(["ada@example.com"]),
      subtitle: text(),
    });
    const input = { zebra: 1, title: "x", apple: 2, subtitle: false };
    const before = Object.getOwnPropertyDescriptors(input);
    expectFailure(collection.validate(input), [
      { code: "too_short", path: ["title"], minimum: 10, actual: 1, unit: "graphemes" },
      { code: "invalid_email", path: ["title"] },
      { code: "invalid_choice", path: ["title"], allowed: ["ada@example.com"] },
      { code: "invalid_type", path: ["subtitle"], expected: "string", received: "boolean" },
      { code: "unknown_field", path: ["apple"] },
      { code: "unknown_field", path: ["zebra"] },
    ]);
    expect(Object.getOwnPropertyDescriptors(input)).toEqual(before);
  });

  test("required and wrong-type failures stop dependent field checks", () => {
    const collection = compileCollection({
      title: text().min(10).email().oneOf(["ada@example.com"]),
    });
    expectFailure(collection.validate({}), [{ code: "required", path: ["title"] }]);
    expectFailure(collection.validate({ title: 123 }), [
      { code: "invalid_type", path: ["title"], expected: "string", received: "number" },
    ]);
  });

  test("diagnostics do not echo a rejected wrong-type value", () => {
    const secret = "unique-private-input-marker";
    const result = compileCollection({ title: text() }).validate({ title: { secret } });
    expectFailure(result, [
      { code: "invalid_type", path: ["title"], expected: "string", received: "object" },
    ]);
    expect(JSON.stringify(result)).not.toContain(secret);
  });
});
