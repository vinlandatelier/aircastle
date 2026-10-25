import { expect, test } from "vite-plus/test";
import * as schema from "../../src/index.ts";

test("invalid compilation throws an instance of the public SchemaError constructor", () => {
  expect(typeof schema.SchemaError).toBe("function");

  let thrown: unknown;
  try {
    schema.compileSchema({
      articles: schema.collection({ title: schema.text().min(2).max(1) }),
    });
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(schema.SchemaError);
});

test("isPlainRecord accepts only plain data records without reading accessors", () => {
  let reads = 0;
  const accessor = Object.defineProperty({}, "title", {
    enumerable: true,
    get() {
      reads++;
      return "Hi";
    },
  });
  expect(schema.isPlainRecord({ title: "Hi" })).toBe(true);
  expect(schema.isPlainRecord(Object.create(null))).toBe(true);
  for (const value of [null, "title", [], new Date(), accessor, { [Symbol("hidden")]: 1 }]) {
    expect(schema.isPlainRecord(value)).toBe(false);
  }
  expect(reads).toBe(0);
});

test("isMember matches self-keyed table names strictly", () => {
  const table = { draft: "draft", published: "published" } as const;
  expect(schema.isMember(table, "draft")).toBe(true);
  for (const value of ["archived", ["draft"], "toString", "__proto__", undefined]) {
    expect(schema.isMember(table, value)).toBe(false);
  }
});
