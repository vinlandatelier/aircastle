import { collection, text, type CodeLanguage } from "@aircastle/schema";
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
      expect(() => describeCollections(definitions)).toThrow();
    },
  );

  test("describeCollections rejects a reserved id alongside otherwise valid fields", () => {
    expect(() =>
      describeCollections({ articles: collection({ title: text(), id: text() }) }),
    ).toThrow();
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

describe("saved optional presence", () => {
  test("an explicit optional undefined property is not a valid stored output", () => {
    const schema = description({ title: field(), summary: field({ required: false }) });
    expect(validateStored(schema, { title: "Hello" })).toBe(true);
    expect(validateStored(schema, { title: "Hello", summary: "" })).toBe(true);
    expect(validateStored(schema, { title: "Hello", summary: undefined })).toBe(false);
  });
});
