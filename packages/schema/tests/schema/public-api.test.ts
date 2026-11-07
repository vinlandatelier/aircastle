import { expect, test } from "vite-plus/test";
import fc from "fast-check";
import * as schema from "../../src/index.ts";
import { compileCollection } from "../support/collections.ts";
import { propertyParameters } from "../support/properties.ts";

const plain = { type: "text", required: true, nullable: false, unique: false };

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

const declaredFields = fc.constantFrom(
  schema.text(),
  schema.text().optional().unique(),
  schema.text().nullable().default(null),
  schema.text().min(1).max(5),
  schema.text().email().optional(),
  schema.text().url().nullable(),
  schema.text().oneOf(["draft", "published"]).default("draft").editor("radio"),
  schema.text().max(80).editor("textarea", { rows: 3 }),
  schema.text().editor("code", { language: "sql" }),
  schema.text().editor("textarea"),
);

test("decodeCollection reads back every description that compileSchema emits", () => {
  const declarations = fc.dictionary(
    fc.constantFrom("title", "slug", "__proto__", "toString"),
    declaredFields,
    { maxKeys: 4 },
  );
  fc.assert(
    fc.property(declarations, (fields) => {
      const description = compileCollection(fields).describe();
      const decoded = schema.decodeCollection(JSON.parse(JSON.stringify(description)));
      expect(decoded.ok && decoded.data.describe()).toEqual(description);
    }),
    propertyParameters,
  );
});

test.each([
  ["a non-record description", null, [{ code: "invalid_description", path: [] }]],
  [
    "an unknown description key",
    { fields: {}, extra: 1 },
    [{ code: "invalid_description", path: [] }],
  ],
  ["non-record fields", { fields: [] }, [{ code: "invalid_description", path: [] }]],
  [
    "an unknown field key",
    { fields: { title: { ...plain, extra: 1 } } },
    [{ code: "invalid_description", path: ["fields", "title"] }],
  ],
  [
    "a non-text field",
    { fields: { title: { ...plain, type: "number" } } },
    [{ code: "invalid_description", path: ["fields", "title"] }],
  ],
  [
    "a non-boolean flag",
    { fields: { title: { ...plain, nullable: "false" } } },
    [{ code: "invalid_description", path: ["fields", "title"] }],
  ],
  [
    "an unsupported format",
    { fields: { title: { ...plain, format: "uuid" } } },
    [{ code: "invalid_description", path: ["fields", "title", "format"] }],
  ],
  [
    "a default on a required field",
    { fields: { title: { ...plain, default: "a" } } },
    [{ code: "invalid_description", path: ["fields", "title", "default"] }],
  ],
  [
    "a textarea without rows",
    { fields: { title: { ...plain, editor: { type: "textarea" } } } },
    [{ code: "invalid_description", path: ["fields", "title", "editor"] }],
  ],
  [
    "a code editor without a language",
    { fields: { title: { ...plain, editor: { type: "code" } } } },
    [{ code: "invalid_description", path: ["fields", "title", "editor"] }],
  ],
  [
    "issues in several fields",
    { fields: { title: { ...plain, min: "1" }, slug: { ...plain, editor: null } } },
    [
      { code: "invalid_bound", path: ["fields", "title"] },
      { code: "invalid_description", path: ["fields", "slug", "editor"] },
    ],
  ],
])("decodeCollection rejects %s with schema issues", (_name, description, issues) => {
  const decoded = schema.decodeCollection(description);
  expect(decoded.ok || decoded.issues.map(({ code, path }) => ({ code, path }))).toEqual(issues);
});
