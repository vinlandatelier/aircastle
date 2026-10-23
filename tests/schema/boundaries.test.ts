import { beforeAll, describe, expect, test } from "bun:test";
import { compileCollection, requireSchemaApi, type RuntimeApi } from "../support/api.ts";
import { expectFailure, expectSuccess } from "../support/assertions.ts";

describe("document boundary and diagnostic order", () => {
  let api: RuntimeApi;
  beforeAll(() => { api = requireSchemaApi(); });

  for (const input of [null, undefined, true, 7, "text", [], 1n, Symbol("root"), () => ({}), new Date(0), new (class Document {})()]) {
    test(`rejects non-document root ${String(input)}`, () => {
      expectFailure(compileCollection(api, { title: api.text() }).validate(input), [{ code: "invalid_document", path: [] }]);
    });
  }

  test("accepts null-prototype documents with own enumerable data fields", () => {
    const input = Object.assign(Object.create(null), { title: "Hi" });
    expectSuccess(compileCollection(api, { title: api.text() }).validate(input), { title: "Hi" });
  });

  test("rejects inherited field getters without reading inherited values", () => {
    let reads = 0;
    const prototype = Object.defineProperty({}, "title", {
      enumerable: true, get() { reads++; throw new Error("Inherited value must not execute"); },
    });
    const input = Object.create(prototype);
    expectFailure(compileCollection(api, { title: api.text() }).validate(input), [{ code: "invalid_document", path: [] }]);
    expect(reads).toBe(0);
  });

  test("a plain document must supply its own required field", () => {
    const name = "inheritedValueForSchemaTest";
    const collection = compileCollection(api, { [name]: api.text() });
    const previous = Object.getOwnPropertyDescriptor(Object.prototype, name);
    let reads = 0;
    let result: unknown;
    // The callback is synchronous and restoration precedes every assertion.
    try {
      Object.defineProperty(Object.prototype, name, {
        configurable: true, get() { reads++; return "Inherited text"; },
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
    const input = Object.defineProperty({}, "title", { enumerable: true, get() { reads++; throw new Error("Must not execute"); } });
    const result = compileCollection(api, { title: api.text() }).validate(input);
    expect(reads).toBe(0);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Accessor document was accepted");
    expect(result.issues.length).toBeGreaterThan(0);
    expect(Object.hasOwn(result, "data")).toBe(false);
  });

  for (const kind of ["symbol", "non-enumerable"] as const) {
    test(`rejects ${kind} own properties without choosing unresolved issue details`, () => {
      const input: Record<string, unknown> = { title: "Hi" };
      Object.defineProperty(input, kind === "symbol" ? Symbol("hidden") : "hidden", { value: "x", enumerable: kind === "symbol" });
      const result = compileCollection(api, { title: api.text() }).validate(input);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("Invalid document was accepted");
      expect(result.issues.length).toBeGreaterThan(0);
      expect(Object.hasOwn(result, "data")).toBe(false);
    });
  }

  test("unknown keys follow declared fields and sort independently of input insertion order", () => {
    const collection = compileCollection(api, {
      title: api.text().min(10).email().oneOf(["ada@example.com"]),
      subtitle: api.text(),
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
    const collection = compileCollection(api, { title: api.text().min(10).email().oneOf(["ada@example.com"]) });
    expectFailure(collection.validate({}), [{ code: "required", path: ["title"] }]);
    expectFailure(collection.validate({ title: 123 }), [{ code: "invalid_type", path: ["title"], expected: "string", received: "number" }]);
  });

  test("diagnostics do not echo a rejected wrong-type value", () => {
    const secret = "unique-private-input-marker";
    const result = compileCollection(api, { title: api.text() }).validate({ title: { secret } });
    expectFailure(result, [{ code: "invalid_type", path: ["title"], expected: "string", received: "object" }]);
    expect(JSON.stringify(result)).not.toContain(secret);
  });
});
