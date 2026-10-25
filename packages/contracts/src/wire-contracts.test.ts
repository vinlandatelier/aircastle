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
import { description, field } from "./support/fixtures.ts";

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
      expect(parseCollections([{ name, description: description() }])).toEqual({
        ok: false,
        error: { code: "invalid_request" },
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
      parseCollections([
        { name: "articles", description: description({ title: field(), id: field() }) },
      ]),
    ).toEqual({ ok: false, error: { code: "invalid_request" } });
  });

  test.each([
    ["textarea unknown option", { type: "textarea", rows: 7, extra: true }],
    ["textarea missing rows", { type: "textarea" }],
    ["textarea nonnumeric rows", { type: "textarea", rows: "7" }],
    ["code unknown option", { type: "code", language: "typescript", extra: true }],
    ["code missing language", { type: "code" }],
    ["code nonstring language", { type: "code", language: 1 }],
    ["code unknown language", { type: "code", language: "ruby" }],
    ["radio unknown option", { type: "radio", extra: true }],
    ["editor primitive", "textarea"],
    ["editor null", null],
  ])("rejects %s", (_name, editor) => {
    const definition = {
      type: "text",
      required: true,
      nullable: false,
      unique: false,
      choices: ["draft", "published"],
      editor,
    };
    expect(
      parseCollections([{ name: "articles", description: { fields: { status: definition } } }]),
    ).toEqual({ ok: false, error: { code: "invalid_request" } });
  });

  test.each([
    ["string minimum", { min: "1" }],
    ["null maximum", { max: null }],
    ["nonstrings in choices", { choices: ["draft", 1] }],
    ["non-array choices", { choices: "draft" }],
    ["numeric default", { required: false, default: 1 }],
    ["required input despite a default", { required: true, default: "draft" }],
  ])("rejects malformed %s", (_name, overrides) => {
    expect(
      parseCollections([
        { name: "articles", description: { fields: { title: { ...field(), ...overrides } } } },
      ]),
    ).toEqual({ ok: false, error: { code: "invalid_request" } });
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
            path: ["wire", "title"],
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
      { ...issue, path: ["wire", "title"], message: expect.any(String) },
    ]);
  });

  test.each([
    ["textarea missing rows", { type: "textarea" }],
    ["code missing language", { type: "code" }],
  ])("rejects %s instead of applying the builder default", (_name, editor) => {
    const malformed = { fields: { title: { ...base, editor } } } as CollectionDescription;
    expect(() => compileDescription(malformed)).toThrow(
      new TypeError("Invalid collection description"),
    );
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
      parseCollections([
        {
          name: "articles",
          description: description({ title: { ...base, editor: editor as never } }),
        },
      ]),
    ).toEqual({ ok: false, error: { code: "invalid_request" } });
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
    parseCollections([
      {
        name: "articles",
        description: {
          fields: {
            status: { ...field({ choices: ["draft", "published"] }), editor: { type: "unknown" } },
          },
        },
      },
    ]),
  ).toEqual({ ok: false, error: { code: "invalid_request" } });
});
