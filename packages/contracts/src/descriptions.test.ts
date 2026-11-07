import { collection, compileSchema, text, type CollectionDescription } from "@aircastle/schema";
import { describe, expect, test } from "vite-plus/test";
import { compileDescription, describeCollections, parseCollections, sameSchema } from "./index.ts";
import {
  articleDescription,
  description,
  field,
  freezeDeep,
  rejection,
  malformedRejection,
  schemaRejection,
} from "./support/fixtures.ts";

describe("published collection descriptions", () => {
  test("describes the complete article declaration in declaration order", () => {
    const declarations = {
      articles: collection({
        title: text().min(1),
        slug: text().unique(),
        summary: text().optional(),
        status: text().oneOf(["draft", "published"]).default("draft"),
      }),
      authors: collection({ name: text() }),
    };
    expect(describeCollections(declarations)).toEqual([
      { name: "articles", description: articleDescription },
      { name: "authors", description: description({ name: field() }) },
    ]);
  });

  test("preserves nullable defaults, bounds, formats and editor metadata", () => {
    expect(
      describeCollections({
        authors: collection({
          email: text().email().unique(),
          website: text().url().optional(),
          note: text().min(0).max(12).nullable().default(null).editor("textarea", { rows: 4 }),
          code: text().editor("code", { language: "typescript" }),
          status: text().oneOf(["draft", "published"]).editor("radio"),
        }),
      }),
    ).toEqual([
      {
        name: "authors",
        description: description({
          email: field({ format: "email", unique: true }),
          website: field({ format: "url", required: false }),
          note: field({
            required: false,
            nullable: true,
            default: null,
            min: 0,
            max: 12,
            editor: { type: "textarea", rows: 4 },
          }),
          code: field({ editor: { type: "code", language: "typescript" } }),
          status: field({ choices: ["draft", "published"], editor: { type: "radio" } }),
        }),
      },
    ]);
  });

  test("accepts an empty project schema", () => {
    expect(parseCollections([])).toEqual({ ok: true, data: [] });
    expect(describeCollections({})).toEqual([]);
  });

  test("parses independent hand-authored descriptors and preserves order", () => {
    const input = [
      { name: "articles", description: structuredClone(articleDescription) },
      { name: "authors", description: description({ name: field() }) },
    ];
    const result = parseCollections(input);
    expect(result).toEqual({ ok: true, data: input });
    if (!result.ok) throw new Error("Expected a valid descriptor fixture");
    Object.defineProperty(input[0]!.description.fields, "title", {
      value: field({ max: 3 }),
      enumerable: true,
      configurable: true,
      writable: true,
    });
    expect(result.data[0]!.description).toEqual(articleDescription);
  });

  test.each([
    ["non-array root", {}, { reason: "invalid_collections", path: [] }],
    ["null root", null, { reason: "invalid_collections", path: [] }],
    [
      "non-array iterable root",
      new Set([{ name: "articles", description: description() }]),
      { reason: "invalid_collections", path: [] },
    ],
    ["null collection", [null], { reason: "invalid_entry", path: [0] }],
    [
      "unknown collection property",
      [{ name: "articles", description: description(), extra: true }],
      { reason: "invalid_entry", path: [0] },
    ],
    [
      "duplicate collection",
      [
        { name: "articles", description: description() },
        { name: "articles", description: description() },
      ],
      { reason: "duplicate_name", path: [1, "name"] },
    ],
    [
      "invalid collection identifier",
      [{ name: "article-posts", description: description() }],
      { reason: "invalid_name", path: [0, "name"] },
    ],
    [
      "non-string collection name",
      [{ name: ["articles"], description: description() }],
      { reason: "invalid_name", path: [0, "name"] },
    ],
    [
      "reserved collection",
      [{ name: "then", description: description() }],
      { reason: "invalid_name", path: [0, "name"] },
    ],
    [
      "unknown description property",
      [{ name: "articles", description: { fields: {}, extra: 1 } }],
      malformedRejection(),
    ],
    ["missing fields", [{ name: "articles", description: {} }], malformedRejection()],
    ["array fields", [{ name: "articles", description: { fields: [] } }], malformedRejection()],
    [
      "reserved id field",
      [{ name: "articles", description: description({ id: field() }) }],
      { reason: "invalid_name", path: [0, "description", "fields", "id"] },
    ],
    [
      "invalid field identifier",
      [{ name: "articles", description: description({ "display title": field() }) }],
      { reason: "invalid_name", path: [0, "description", "fields", "display title"] },
    ],
    [
      "null field",
      [{ name: "articles", description: { fields: { title: null } } }],
      malformedRejection("fields", "title"),
    ],
    [
      "unknown field kind",
      [{ name: "articles", description: { fields: { title: { ...field(), type: "number" } } } }],
      malformedRejection("fields", "title"),
    ],
    [
      "unknown field property",
      [{ name: "articles", description: { fields: { title: { ...field(), extra: true } } } }],
      malformedRejection("fields", "title"),
    ],
    [
      "invalid required flag",
      [{ name: "articles", description: { fields: { title: { ...field(), required: "yes" } } } }],
      malformedRejection("fields", "title"),
    ],
    [
      "invalid nullable flag",
      [{ name: "articles", description: { fields: { title: { ...field(), nullable: "yes" } } } }],
      malformedRejection("fields", "title"),
    ],
    [
      "invalid unique flag",
      [{ name: "articles", description: { fields: { title: { ...field(), unique: 1 } } } }],
      malformedRejection("fields", "title"),
    ],
    [
      "explicit undefined default",
      [
        {
          name: "articles",
          description: { fields: { title: { ...field(), required: false, default: undefined } } },
        },
      ],
      schemaRejection("invalid_default"),
    ],
    [
      "missing required flag",
      [
        {
          name: "articles",
          description: { fields: { title: { type: "text", nullable: false, unique: false } } },
        },
      ],
      malformedRejection("fields", "title"),
    ],
    [
      "negative minimum",
      [{ name: "articles", description: description({ title: field({ min: -1 }) }) }],
      schemaRejection("invalid_bound"),
    ],
    [
      "fractional maximum",
      [{ name: "articles", description: description({ title: field({ max: 1.5 }) }) }],
      schemaRejection("invalid_bound"),
    ],
    [
      "contradictory bounds",
      [{ name: "articles", description: description({ title: field({ min: 5, max: 3 }) }) }],
      schemaRejection("conflicting_bounds"),
    ],
    [
      "invalid default",
      [
        {
          name: "articles",
          description: description({ title: field({ required: false, min: 5, default: "Hi" }) }),
        },
      ],
      schemaRejection("invalid_default"),
    ],
    [
      "null default without nullable",
      [
        {
          name: "articles",
          description: description({ title: field({ required: false, default: null }) }),
        },
      ],
      schemaRejection("invalid_default"),
    ],
    [
      "empty choices",
      [{ name: "articles", description: description({ title: field({ choices: [] }) }) }],
      schemaRejection("invalid_choices"),
    ],
    [
      "duplicate choices",
      [
        {
          name: "articles",
          description: description({ title: field({ choices: ["draft", "draft"] }) }),
        },
      ],
      schemaRejection("duplicate_choice"),
    ],
    [
      "invalid format",
      [{ name: "articles", description: { fields: { title: { ...field(), format: "uuid" } } } }],
      malformedRejection("fields", "title", "format"),
    ],
    [
      "unknown editor",
      [
        {
          name: "articles",
          description: { fields: { title: { ...field(), editor: { type: "richtext" } } } },
        },
      ],
      schemaRejection("unknown_editor"),
    ],
    [
      "invalid textarea rows",
      [
        {
          name: "articles",
          description: description({ title: field({ editor: { type: "textarea", rows: 0 } }) }),
        },
      ],
      schemaRejection("invalid_editor_options"),
    ],
    [
      "radio without choices",
      [
        {
          name: "articles",
          description: description({ title: field({ editor: { type: "radio" } }) }),
        },
      ],
      schemaRejection("incompatible_editor"),
    ],
  ])("rejects %s without partially accepting the project", (_name, invalid, reason) => {
    expect(rejection(invalid)).toEqual(reason);
  });

  test("rejects accessors without invoking supplied code", () => {
    let called = false;
    const input = Object.defineProperty({}, "name", {
      enumerable: true,
      get() {
        called = true;
        return "articles";
      },
    });
    expect(rejection([input])).toEqual({ reason: "invalid_entry", path: [0] });
    expect(called).toBe(false);
  });

  test("legal toString collection and prototype-like field names survive wire parsing", () => {
    const fields = Object.fromEntries([
      ["__proto__", field()],
      ["constructor", field()],
    ]);
    const input = [{ name: "toString", description: description(fields) }];
    const result = parseCollections(input);
    expect(result).toEqual({ ok: true, data: input });
    if (!result.ok) throw new Error("Expected legal own-property names");
    const parsed = result.data[0]!.description.fields;
    expect(Object.hasOwn(parsed, "__proto__")).toBe(true);
    expect(Object.hasOwn(parsed, "constructor")).toBe(true);
    expect([Object.prototype, null]).toContain(Object.getPrototypeOf(parsed));
    expect({}.constructor).toBe(Object);
  });

  test("a later invalid collection prevents an otherwise valid project parse", () => {
    expect(
      rejection([
        { name: "articles", description: articleDescription },
        { name: "bad-name", description: description() },
      ]),
    ).toEqual({ reason: "invalid_name", path: [1, "name"] });
  });

  test("recompiles defaults and validation from a wire descriptor", () => {
    const compiled = compileDescription(articleDescription);
    expect(compiled.describe()).toEqual(articleDescription);
    expect(compiled.validate({ title: "Hello", slug: "hello" })).toEqual({
      ok: true,
      data: { title: "Hello", slug: "hello", status: "draft" },
    });
    const rejected = compiled.validate({ title: "", slug: 4, extra: "x" });
    expect(rejected.ok).toBe(false);
    if (rejected.ok) throw new Error("Expected invalid document");
    expect(rejected.issues.map(({ message: _message, ...issue }) => issue)).toEqual([
      { code: "too_short", path: ["title"], minimum: 1, actual: 0, unit: "graphemes" },
      { code: "invalid_type", path: ["slug"], expected: "string", received: "number" },
      { code: "unknown_field", path: ["extra"] },
    ]);
  });

  test("wire recompilation enforces formats, choices and nullable presence", () => {
    const compiled = compileDescription(
      description({
        email: field({ format: "email" }),
        website: field({ format: "url" }),
        notes: field({ nullable: true }),
        status: field({ required: false, choices: ["draft", "published"], default: "draft" }),
      }),
    );
    expect(
      compiled.validate({ email: "ada@example.com", website: "https://example.com", notes: null }),
    ).toEqual({
      ok: true,
      data: {
        email: "ada@example.com",
        website: "https://example.com",
        notes: null,
        status: "draft",
      },
    });
    const result = compiled.validate({
      email: "not an email",
      website: "not a URL",
      status: "archived",
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected format and presence failures");
    expect(result.issues.map(({ message: _message, ...issue }) => issue)).toEqual([
      { code: "invalid_email", path: ["email"] },
      { code: "invalid_url", path: ["website"] },
      { code: "required", path: ["notes"] },
      { code: "invalid_choice", path: ["status"], allowed: ["draft", "published"] },
    ]);
  });

  test("wire recompilation retains grapheme length and exact text", () => {
    const compiled = compileDescription(description({ title: field({ min: 1, max: 1 }) }));
    expect(compiled.validate({ title: "e\u0301" })).toEqual({
      ok: true,
      data: { title: "e\u0301" },
    });
    expect(compiled.validate({ title: "👨‍👩‍👧‍👦" })).toEqual({ ok: true, data: { title: "👨‍👩‍👧‍👦" } });
    expect(compiled.validate({ title: "éé" }).ok).toBe(false);
  });

  test("descriptor operations do not mutate frozen caller input", () => {
    const input = freezeDeep([
      { name: "articles", description: structuredClone(articleDescription) },
    ]);
    expect(parseCollections(input)).toEqual({ ok: true, data: input });
    expect(compileDescription(input[0]!.description).describe()).toEqual(articleDescription);
    expect(input).toEqual([{ name: "articles", description: articleDescription }]);
  });
});

describe("publication equality", () => {
  test("identical empty and nonempty schemas are equal", () => {
    expect(sameSchema([], [])).toBe(true);
    const schema = [{ name: "articles", description: articleDescription }];
    expect(sameSchema(schema, structuredClone(schema))).toBe(true);
  });

  test("equivalent builder chains describe the same published schema", () => {
    const first = [
      {
        name: "articles",
        description: compileSchema({
          articles: collection({ title: text().min(1).min(3) }),
        }).articles.describe(),
      },
    ];
    const second = [{ name: "articles", description: description({ title: field({ min: 3 }) }) }];
    expect(sameSchema(first, second)).toBe(true);
  });

  test.each([
    ["editor", description({ title: field({ editor: { type: "textarea", rows: 3 } }) })],
    ["bound", description({ title: field({ min: 1 }) })],
    ["default", description({ title: field({ required: false, default: "draft" }) })],
    [
      "null default",
      description({ title: field({ required: false, nullable: true, default: null }) }),
    ],
    ["unique", description({ title: field({ unique: true }) })],
  ])("a changed %s changes publication equality", (_name, changed) => {
    expect(
      sameSchema(
        [{ name: "articles", description: description() }],
        [{ name: "articles", description: changed }],
      ),
    ).toBe(false);
  });

  test("equality does not sort or mutate a caller's frozen declaration order", () => {
    const left = freezeDeep([
      {
        name: "posts",
        description: description({ title: field(), summary: field({ required: false }) }),
      },
      { name: "authors", description: description({ name: field() }) },
    ]);
    const right = freezeDeep(structuredClone(left));
    expect(sameSchema(left, right)).toBe(true);
    expect(left.map((item) => item.name)).toEqual(["posts", "authors"]);
    expect(Object.keys(left[0]!.description.fields)).toEqual(["title", "summary"]);
  });

  test("collection and field declaration orders are observable publication metadata", () => {
    const articles = { name: "articles", description: description() };
    const authors = { name: "authors", description: description({ name: field() }) };
    expect(sameSchema([articles, authors], [authors, articles])).toBe(false);
    const left: CollectionDescription = description({
      title: field(),
      summary: field({ required: false }),
    });
    const right: CollectionDescription = description({
      summary: field({ required: false }),
      title: field(),
    });
    expect(
      sameSchema(
        [{ name: "articles", description: left }],
        [{ name: "articles", description: right }],
      ),
    ).toBe(false);
  });
});
