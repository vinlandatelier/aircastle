import { describe, expect, test } from "vite-plus/test";
import { collection, compileSchema, text } from "../../src/index.ts";
import { compileCollection, textField } from "../support/collections.ts";
import {
  expectFailure,
  expectOwnKeys,
  expectSchemaError,
  expectSuccess,
} from "../support/assertions.ts";

describe("descriptions, editors and reusable declarations", () => {
  test("textarea description includes effective defaults and omits unset metadata", () => {
    const description = compileCollection({
      title: text().min(3).editor("textarea"),
    }).describe();
    expect(description).toEqual({
      fields: {
        title: {
          type: "text",
          required: true,
          nullable: false,
          min: 3,
          unique: false,
          editor: { type: "textarea", rows: 4 },
        },
      },
    });
    expectOwnKeys(description, ["fields"]);
    expectOwnKeys(description.fields.title!, [
      "type",
      "required",
      "nullable",
      "min",
      "unique",
      "editor",
    ]);
    expect(JSON.parse(JSON.stringify(description))).toEqual(description);
  });

  test("defaulted radio metadata describes input presence and ordered choices", () => {
    const description = compileCollection({
      status: text().oneOf(["published", "draft"]).default("draft").editor("radio"),
    }).describe();
    expect(description).toEqual({
      fields: {
        status: {
          type: "text",
          required: false,
          nullable: false,
          choices: ["published", "draft"],
          default: "draft",
          unique: false,
          editor: { type: "radio" },
        },
      },
    });
    expectOwnKeys(description.fields.status!, [
      "type",
      "required",
      "nullable",
      "choices",
      "default",
      "unique",
      "editor",
    ]);
  });

  test("effective bounds, format, nullable, optional and uniqueness are described", () => {
    const description = compileCollection({
      email: text()
        .min(3)
        .min(5)
        .max(100)
        .max(80)
        .email()
        .nullable()
        .optional()
        .unique()
        .editor("textarea", { rows: 7 }),
    }).describe();
    expect(description).toEqual({
      fields: {
        email: {
          type: "text",
          required: false,
          nullable: true,
          min: 5,
          max: 80,
          format: "email",
          unique: true,
          editor: { type: "textarea", rows: 7 },
        },
      },
    });
  });

  test("code defaults to plaintext and does not validate language syntax", () => {
    const defaultCode = compileCollection({ body: text().editor("code") });
    expect(textField(defaultCode.describe(), "body").editor).toEqual({
      type: "code",
      language: "plaintext",
    });
    for (const language of [
      "plaintext",
      "javascript",
      "typescript",
      "json",
      "html",
      "css",
      "markdown",
      "sql",
    ] as const) {
      const collection = compileCollection({ body: text().editor("code", { language }) });
      expect(textField(collection.describe(), "body").editor).toEqual({ type: "code", language });
      expectSuccess(collection.validate({ body: "this is not valid code {{{" }), {
        body: "this is not valid code {{{",
      });
    }
  });

  for (const rows of [0, -1, 1.5, NaN, Infinity, "4", null]) {
    test(`rejects invalid textarea rows ${String(rows)}`, () => {
      const field = text().editor("textarea", { rows: rows as number });
      expectSchemaError(
        () => compileCollection({ title: field }),
        [
          {
            code: "invalid_editor_options",
            path: ["articles", "title"],
            option: "rows",
            reason: "invalid_value",
          },
        ],
      );
    });
  }

  for (const [editor, options, option, reason] of [
    ["textarea", { language: "sql" }, "language", "unknown_option"],
    ["code", { rows: 4 }, "rows", "unknown_option"],
    ["code", { language: "python" }, "language", "invalid_value"],
    ["radio", { rows: 4 }, "rows", "unknown_option"],
  ] as const) {
    test(`rejects ${editor} option ${option}`, () => {
      const field = text()
        .oneOf(["a"])
        .editor(editor as "textarea", options as { rows?: number });
      expectSchemaError(
        () => compileCollection({ title: field }),
        [{ code: "invalid_editor_options", path: ["articles", "title"], option, reason }],
      );
    });
  }

  test("radio requires choices", () => {
    const field = text().editor("radio");
    expectSchemaError(
      () => compileCollection({ title: field }),
      [
        {
          code: "incompatible_editor",
          path: ["articles", "title"],
          editor: "radio",
          reason: "requires_choices",
        },
      ],
    );
  });

  test("editor settings do not alter acceptance or defaults", () => {
    const base = text().min(2).oneOf(["aa", "bb"]).default("aa");
    for (const field of [
      base,
      base.editor("textarea"),
      base.editor("code", { language: "json" }),
      base.editor("radio"),
    ]) {
      const collection = compileCollection({ title: field });
      expectSuccess(collection.validate({}), { title: "aa" });
      expectSuccess(collection.validate({ title: "bb" }), { title: "bb" });
      expectFailure(collection.validate({ title: "cc" }), [
        { code: "invalid_choice", path: ["title"], allowed: ["aa", "bb"] },
      ]);
    }
  });

  test("choices and editor options are captured at declaration time", () => {
    const choices = ["draft", "published"];
    const options = { rows: 5 };
    const field = text().oneOf(choices).editor("textarea", options);
    choices.push("before");
    options.rows = 8;
    const collection = compileCollection({ title: field });
    choices.push("after");
    options.rows = 9;
    expect(textField(collection.describe(), "title").choices).toEqual(["draft", "published"]);
    expect(textField(collection.describe(), "title").editor).toEqual({ type: "textarea", rows: 5 });
    for (const title of ["before", "after"])
      expectFailure(collection.validate({ title }), [
        { code: "invalid_choice", path: ["title"], allowed: ["draft", "published"] },
      ]);
    expect(choices).toEqual(["draft", "published", "before", "after"]);
    expect(options.rows).toBe(9);
  });

  test("accepts frozen caller-owned configuration", () => {
    const choices = Object.freeze(["draft", "published"]);
    const options = Object.freeze({ rows: 3 });
    const fields = Object.freeze({ title: text().oneOf(choices).editor("textarea", options) });
    const collections = Object.freeze({ articles: collection(fields) });
    const compiled = compileSchema(collections).articles;
    expectSuccess(compiled.validate(Object.freeze({ title: "draft" })), { title: "draft" });
  });

  test("deriving fields preserves the base and reports current reuse paths", () => {
    const base = text();
    const short = base.max(3);
    const optional = base.optional();
    const schema = compileSchema({
      long: collection({ title: base }),
      short: collection({ caption: short }),
      optional: collection({ subtitle: optional }),
    });
    const elsewhere = compileCollection({ other: short });
    for (let run = 0; run < 3; run++) {
      expectSuccess(schema.long!.validate({ title: "Hello" }), { title: "Hello" });
      expectFailure(schema.short!.validate({ caption: "Hello" }), [
        { code: "too_long", path: ["caption"], maximum: 3, actual: 5, unit: "graphemes" },
      ]);
      expectSuccess(schema.optional!.validate({}), {});
      expectFailure(schema.long!.validate({}), [{ code: "required", path: ["title"] }]);
      schema.short!.describe();
      expectFailure(elsewhere.validate({ other: "Hello" }), [
        { code: "too_long", path: ["other"], maximum: 3, actual: 5, unit: "graphemes" },
      ]);
    }
  });

  test("uniqueness is metadata and repeated equal values remain valid", () => {
    const collection = compileCollection({ title: text().unique() });
    expectSuccess(collection.validate({ title: "same" }), { title: "same" });
    expectSuccess(collection.validate({ title: "same" }), { title: "same" });
  });
});
