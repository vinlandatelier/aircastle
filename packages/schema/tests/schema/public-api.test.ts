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

test("assertCollectionDefinitions accepts declared collections and throws compileSchema's issues otherwise", () => {
  const declared: unknown = { articles: schema.collection({ title: schema.text() }) };
  schema.assertCollectionDefinitions(declared);
  expect(Object.keys(schema.compileSchema(declared))).toEqual(["articles"]);

  for (const value of [null, { articles: { title: "text" } }, { articles: schema.text() }]) {
    let thrown: unknown;
    try {
      schema.assertCollectionDefinitions(value);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(schema.SchemaError);
    expect(thrown).toMatchObject({ issues: [{ code: "invalid_definition" }] });
  }
});

test("uncheckedText builds the same field as the typed builder and leaves validation to compileSchema", () => {
  const choices: unknown[] = ["draft", "published"];
  const unchecked = schema.uncheckedText([
    { kind: "optional" },
    { kind: "nullable" },
    { kind: "unique" },
    { kind: "min", value: 1 },
    { kind: "max", value: 20 },
    { kind: "choices", value: choices },
    { kind: "default", value: "draft" },
    { kind: "editor", name: "radio", options: undefined },
  ]);
  choices.push("archived");
  const typed = schema
    .text()
    .optional()
    .nullable()
    .unique()
    .min(1)
    .max(20)
    .oneOf(["draft", "published"])
    .default("draft")
    .editor("radio");
  const described = (field: Parameters<typeof schema.collection>[0][string]) =>
    schema.compileSchema({ articles: schema.collection({ status: field }) }).articles.describe();
  expect(described(unchecked)).toEqual(described(typed));

  const code = schema.uncheckedText([
    { kind: "editor", name: "code", options: { language: "sql" } },
    { kind: "format", value: "email" },
  ]);
  expect(described(code).fields.status).toMatchObject({
    format: "email",
    editor: { type: "code", language: "sql" },
  });

  expect(() => described(schema.uncheckedText([{ kind: "min", value: "1" }]))).toThrow(
    schema.SchemaError,
  );
});
