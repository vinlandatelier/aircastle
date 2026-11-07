import {
  collection,
  SchemaError,
  text,
  type CodeLanguage,
  type CollectionDescription,
} from "@aircastle/schema";
import { describe, expect, test } from "vite-plus/test";
import {
  compileDescription,
  describeCollections,
  parseCollections,
  validateStored,
} from "./index.ts";
import {
  description,
  field,
  malformedRejection,
  rejection,
  schemaRejection,
} from "./support/fixtures.ts";

const codeLanguages: Record<CodeLanguage, true> = {
  plaintext: true,
  javascript: true,
  typescript: true,
  json: true,
  html: true,
  css: true,
  markdown: true,
  sql: true,
};

function nullRecord<Value extends object>(value: Value): Value {
  return Object.assign(Object.create(null), value);
}

describe("accepted wire editor and default descriptions", () => {
  test("textarea preserves its explicit row count without changing text validation", () => {
    const expected = description({ body: field({ editor: { type: "textarea", rows: 7 } }) });
    expect(parseCollections([{ name: "articles", description: expected }])).toEqual({
      ok: true,
      data: [{ name: "articles", description: expected }],
    });
    const compiled = compileDescription(expected);
    expect(compiled.describe()).toEqual(expected);
    expect(compiled.validate({ body: "Plain text\nSecond line" })).toEqual({
      ok: true,
      data: { body: "Plain text\nSecond line" },
    });
  });

  test.each(Object.keys(codeLanguages) as CodeLanguage[])(
    "code editor preserves %s as presentation metadata",
    (language) => {
      const expected = description({ body: field({ editor: { type: "code", language } }) });
      expect(parseCollections([{ name: "articles", description: expected }])).toEqual({
        ok: true,
        data: [{ name: "articles", description: expected }],
      });
      const compiled = compileDescription(expected);
      expect(compiled.describe()).toEqual(expected);
      expect(
        compiled.validate({ body: "This text does not have to parse as source code." }),
      ).toEqual({
        ok: true,
        data: { body: "This text does not have to parse as source code." },
      });
    },
  );

  test("radio preserves the choice contract and presentation metadata", () => {
    const expected = description({
      status: field({ choices: ["draft", "published"], editor: { type: "radio" } }),
    });
    expect(parseCollections([{ name: "articles", description: expected }])).toEqual({
      ok: true,
      data: [{ name: "articles", description: expected }],
    });
    const compiled = compileDescription(expected);
    expect(compiled.describe()).toEqual(expected);
    expect(compiled.validate({ status: "published" })).toEqual({
      ok: true,
      data: { status: "published" },
    });
    const invalid = compiled.validate({ status: "archived" });
    expect(invalid).toMatchObject({
      ok: false,
      issues: [{ code: "invalid_choice", path: ["status"], allowed: ["draft", "published"] }],
    });
  });

  test.each([
    ["string", field({ required: false, default: "Hello" }), "Hello"],
    ["null", field({ required: false, nullable: true, default: null }), null],
  ] as const)(
    "a valid %s default survives parsing and is applied on creation",
    (_name, definition, expectedValue) => {
      const expected = description({ title: definition });
      expect(parseCollections([{ name: "articles", description: expected }])).toEqual({
        ok: true,
        data: [{ name: "articles", description: expected }],
      });
      const compiled = compileDescription(expected);
      expect(compiled.describe()).toEqual(expected);
      expect(compiled.validate({})).toEqual({ ok: true, data: { title: expectedValue } });
    },
  );

  test("a plain empty fields record is a valid empty collection", () => {
    expect(parseCollections([{ name: "empty", description: { fields: {} } }])).toEqual({
      ok: true,
      data: [{ name: "empty", description: { fields: {} } }],
    });
  });

  test("null-prototype records are valid at every wire-object boundary", () => {
    const expected = description({ body: field({ editor: { type: "code", language: "json" } }) });
    const editor = nullRecord({ type: "code", language: "json" });
    const definition = nullRecord({
      type: "text",
      required: true,
      nullable: false,
      unique: false,
      editor,
    });
    const fields = nullRecord({ body: definition });
    const entry = nullRecord({ name: "articles", description: nullRecord({ fields }) });
    expect(parseCollections([entry])).toEqual({
      ok: true,
      data: [{ name: "articles", description: expected }],
    });
    expect(Object.getPrototypeOf(entry)).toBeNull();
    expect(Object.getPrototypeOf(entry.description)).toBeNull();
    expect(Object.getPrototypeOf(fields)).toBeNull();
    expect(Object.getPrototypeOf(definition)).toBeNull();
    expect(Object.getPrototypeOf(editor)).toBeNull();
  });
});

describe("wire declaration rejection", () => {
  test.each(["then", "close", "constructor", "prototype", "__proto__", "toJSON"])(
    "parseCollections rejects reserved collection %s independently",
    (name) => {
      expect(rejection([{ name, description: description() }])).toEqual({
        reason: "invalid_name",
        path: [0, "name"],
      });
    },
  );

  test.each(["then", "close", "constructor", "prototype", "__proto__", "toJSON"])(
    "describeCollections rejects reserved collection %s independently",
    (name) => {
      const definitions = Object.fromEntries([[name, collection({ title: text() })]]);
      expect(() => describeCollections(definitions)).toThrow(
        new TypeError("Invalid collection description"),
      );
    },
  );

  test("describeCollections rejects a reserved id alongside otherwise valid fields", () => {
    expect(() =>
      describeCollections({ articles: collection({ title: text(), id: text() }) }),
    ).toThrow(new TypeError("Invalid collection description"));
  });

  test("parseCollections rejects a reserved id alongside otherwise valid fields", () => {
    expect(
      rejection([{ name: "articles", description: description({ title: field(), id: field() }) }]),
    ).toEqual({ reason: "invalid_name", path: [0, "description", "fields", "id"] });
  });

  test.each([
    [
      "textarea unknown option",
      { type: "textarea", rows: 7, extra: true },
      schemaRejection("invalid_editor_options", "status"),
    ],
    [
      "textarea missing rows",
      { type: "textarea" },
      malformedRejection("fields", "status", "editor"),
    ],
    [
      "textarea nonnumeric rows",
      { type: "textarea", rows: "7" },
      schemaRejection("invalid_editor_options", "status"),
    ],
    [
      "code unknown option",
      { type: "code", language: "typescript", extra: true },
      schemaRejection("invalid_editor_options", "status"),
    ],
    ["code missing language", { type: "code" }, malformedRejection("fields", "status", "editor")],
    [
      "code nonstring language",
      { type: "code", language: 1 },
      schemaRejection("invalid_editor_options", "status"),
    ],
    [
      "code unknown language",
      { type: "code", language: "ruby" },
      schemaRejection("invalid_editor_options", "status"),
    ],
    [
      "radio unknown option",
      { type: "radio", extra: true },
      schemaRejection("invalid_editor_options", "status"),
    ],
    ["editor primitive", "textarea", malformedRejection("fields", "status", "editor")],
    ["editor null", null, malformedRejection("fields", "status", "editor")],
  ])("rejects %s", (_name, editor, reason) => {
    const definition = {
      type: "text",
      required: true,
      nullable: false,
      unique: false,
      choices: ["draft", "published"],
      editor,
    };
    expect(
      rejection([{ name: "articles", description: { fields: { status: definition } } }]),
    ).toEqual(reason);
  });

  test.each([
    ["string minimum", { min: "1" }, schemaRejection("invalid_bound")],
    ["null maximum", { max: null }, schemaRejection("invalid_bound")],
    ["nonstrings in choices", { choices: ["draft", 1] }, schemaRejection("invalid_choices")],
    ["non-array choices", { choices: "draft" }, schemaRejection("invalid_choices")],
    ["numeric default", { required: false, default: 1 }, schemaRejection("invalid_default")],
    [
      "required input despite a default",
      { required: true, default: "draft" },
      malformedRejection("fields", "title", "default"),
    ],
  ])("rejects malformed %s", (_name, overrides, reason) => {
    expect(
      rejection([
        { name: "articles", description: { fields: { title: { ...field(), ...overrides } } } },
      ]),
    ).toEqual(reason);
  });
});

describe("wire field values are validated by the schema compiler", () => {
  const base = field({ required: false, choices: ["draft", "published"] });
  test.each([
    ["string minimum", { min: "1" }, { code: "invalid_bound", constraint: "min" }],
    ["null maximum", { max: null }, { code: "invalid_bound", constraint: "max" }],
    [
      "non-array choices",
      { choices: "draft" },
      { code: "invalid_choices", reason: "invalid_type" },
    ],
    [
      "nonstrings in choices",
      { choices: ["draft", 1] },
      { code: "invalid_choices", reason: "invalid_type", index: 1 },
    ],
    [
      "numeric default",
      { default: 1 },
      {
        code: "invalid_default",
        causes: [
          {
            code: "invalid_type",
            path: ["fields", "title"],
            expected: "string",
            received: "number",
            message: "Expected a text value.",
          },
        ],
      },
    ],
    [
      "textarea nonnumeric rows",
      { editor: { type: "textarea", rows: "7" } },
      { code: "invalid_editor_options", option: "rows", reason: "invalid_value" },
    ],
    [
      "textarea unknown option",
      { editor: { type: "textarea", rows: 7, extra: true } },
      { code: "invalid_editor_options", option: "extra", reason: "unknown_option" },
    ],
    [
      "code unknown language",
      { editor: { type: "code", language: "ruby" } },
      { code: "invalid_editor_options", option: "language", reason: "invalid_value" },
    ],
    [
      "code nonstring language",
      { editor: { type: "code", language: 1 } },
      { code: "invalid_editor_options", option: "language", reason: "invalid_value" },
    ],
    [
      "radio unknown option",
      { editor: { type: "radio", extra: true } },
      { code: "invalid_editor_options", option: "extra", reason: "unknown_option" },
    ],
    [
      "unknown editor",
      { editor: { type: "richtext" } },
      { code: "unknown_editor", editor: "richtext" },
    ],
    [
      "missing editor type",
      { editor: {} },
      { code: "invalid_editor", expected: "string", received: "undefined" },
    ],
  ])("rejects %s as a schema issue", (_name, overrides, issue) => {
    const malformed = { fields: { title: { ...base, ...overrides } } } as CollectionDescription;
    let thrown: unknown;
    try {
      compileDescription(malformed);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(SchemaError);
    expect((thrown as SchemaError).issues).toStrictEqual([
      { ...issue, path: ["fields", "title"], message: expect.any(String) },
    ]);
  });

  test.each([
    ["textarea missing rows", { type: "textarea" }],
    ["code missing language", { type: "code" }],
  ])("rejects %s instead of applying the builder default", (_name, editor) => {
    const malformed = { fields: { title: { ...base, editor } } } as CollectionDescription;
    let thrown: unknown;
    try {
      compileDescription(malformed);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(SchemaError);
    expect((thrown as SchemaError).issues).toStrictEqual([
      {
        code: "invalid_description",
        path: ["fields", "title", "editor"],
        message: expect.any(String),
      },
    ]);
  });

  test("rejects an editor accessor without invoking supplied code", () => {
    let called = false;
    const editor = Object.defineProperty({}, "type", {
      enumerable: true,
      get() {
        called = true;
        return "radio";
      },
    });
    expect(
      rejection([
        {
          name: "articles",
          description: description({ title: { ...base, editor: editor as never } }),
        },
      ]),
    ).toEqual(malformedRejection("fields", "title", "editor"));
    expect(called).toBe(false);
  });
});

describe("saved optional presence", () => {
  test("an explicit optional undefined property is not a valid stored output", () => {
    const schema = description({ title: field(), summary: field({ required: false }) });
    expect(validateStored(schema, { title: "Hello" })).toBe(true);
    expect(validateStored(schema, { title: "Hello", summary: "" })).toBe(true);
    expect(validateStored(schema, { title: "Hello", summary: undefined })).toBe(false);
  });
});

test("unknown editor kinds stay invalid when valid choices could satisfy a radio editor", () => {
  expect(
    rejection([
      {
        name: "articles",
        description: {
          fields: {
            status: { ...field({ choices: ["draft", "published"] }), editor: { type: "unknown" } },
          },
        },
      },
    ]),
  ).toEqual(schemaRejection("unknown_editor", "status"));
});
