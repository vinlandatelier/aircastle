import { collection, compileSchema, text, type CollectionDescription } from "@aircastle/schema";
import { describe, expect, test } from "vite-plus/test";
import { compileDescription, describeCollections, parseCollections, sameSchema } from "./index.ts";
import { articleDescription, description, field, freezeDeep } from "./support/fixtures.ts";

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
    ["non-array root", {}],
    ["null root", null],
    ["null collection", [null]],
    [
      "unknown collection property",
      [{ name: "articles", description: description(), extra: true }],
    ],
    [
      "duplicate collection",
      [
        { name: "articles", description: description() },
        { name: "articles", description: description() },
      ],
    ],
    ["invalid collection identifier", [{ name: "article-posts", description: description() }]],
    ["reserved collection", [{ name: "then", description: description() }]],
    ["unknown description property", [{ name: "articles", description: { fields: {}, extra: 1 } }]],
    ["missing fields", [{ name: "articles", description: {} }]],
    ["array fields", [{ name: "articles", description: { fields: [] } }]],
    ["reserved id field", [{ name: "articles", description: description({ id: field() }) }]],
    [
      "invalid field identifier",
      [{ name: "articles", description: description({ "display title": field() }) }],
    ],
    ["null field", [{ name: "articles", description: { fields: { title: null } } }]],
    [
      "unknown field kind",
      [{ name: "articles", description: { fields: { title: { ...field(), type: "number" } } } }],
    ],
    [
      "unknown field property",
      [{ name: "articles", description: { fields: { title: { ...field(), extra: true } } } }],
    ],
    [
      "invalid required flag",
      [{ name: "articles", description: { fields: { title: { ...field(), required: "yes" } } } }],
    ],
    [
      "invalid nullable flag",
      [{ name: "articles", description: { fields: { title: { ...field(), nullable: "yes" } } } }],
    ],
    [
      "invalid unique flag",
      [{ name: "articles", description: { fields: { title: { ...field(), unique: 1 } } } }],
    ],
    [
      "explicit undefined default",
      [
        {
          name: "articles",
          description: { fields: { title: { ...field(), required: false, default: undefined } } },
        },
      ],
    ],
    [
      "missing required flag",
      [
        {
          name: "articles",
          description: { fields: { title: { type: "text", nullable: false, unique: false } } },
        },
      ],
    ],
    [
      "negative minimum",
      [{ name: "articles", description: description({ title: field({ min: -1 }) }) }],
    ],
    [
      "fractional maximum",
      [{ name: "articles", description: description({ title: field({ max: 1.5 }) }) }],
    ],
    [
      "contradictory bounds",
      [{ name: "articles", description: description({ title: field({ min: 5, max: 3 }) }) }],
    ],
    [
      "invalid default",
      [
        {
          name: "articles",
          description: description({ title: field({ required: false, min: 5, default: "Hi" }) }),
        },
      ],
    ],
    [
      "null default without nullable",
      [
        {
          name: "articles",
          description: description({ title: field({ required: false, default: null }) }),
        },
      ],
    ],
    [
      "empty choices",
      [{ name: "articles", description: description({ title: field({ choices: [] }) }) }],
    ],
    [
      "duplicate choices",
      [
        {
          name: "articles",
          description: description({ title: field({ choices: ["draft", "draft"] }) }),
        },
      ],
    ],
    [
      "invalid format",
      [{ name: "articles", description: { fields: { title: { ...field(), format: "uuid" } } } }],
    ],
    [
      "unknown editor",
      [
        {
          name: "articles",
          description: { fields: { title: { ...field(), editor: { type: "richtext" } } } },
        },
      ],
    ],
    [
      "invalid textarea rows",
      [
        {
          name: "articles",
          description: description({ title: field({ editor: { type: "textarea", rows: 0 } }) }),
        },
      ],
    ],
    [
      "radio without choices",
      [
        {
          name: "articles",
          description: description({ title: field({ editor: { type: "radio" } }) }),
        },
      ],
    ],
  ])("rejects %s without partially accepting the project", (_name, invalid) => {
    expect(parseCollections(invalid)).toEqual({ ok: false, error: { code: "invalid_request" } });
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
    expect(parseCollections([input])).toEqual({ ok: false, error: { code: "invalid_request" } });
    expect(called).toBe(false);
  });

  test("a later invalid collection prevents an otherwise valid project parse", () => {
    expect(
      parseCollections([
        { name: "articles", description: articleDescription },
        { name: "bad-name", description: description() },
      ]),
    ).toEqual({ ok: false, error: { code: "invalid_request" } });
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
