import { describe, expect, test } from "vite-plus/test";
import type { CollectionDescription, TextFieldDescription } from "@aircastle/schema";
import { compatibleForCreate, projectDocument, validateStored } from "./index.ts";
import { description, field, freezeDeep } from "./support/fixtures.ts";

const cases: readonly [
  string,
  Partial<TextFieldDescription>,
  Partial<TextFieldDescription>,
  boolean,
][] = [
  ["identical unbounded fields", {}, {}, true],
  ["client minimum is stricter", { min: 5 }, { min: 3 }, true],
  ["client minimum matches", { min: 5 }, { min: 5 }, true],
  ["server minimum tightens", { min: 3 }, { min: 5 }, false],
  ["server adds a minimum", {}, { min: 1 }, false],
  ["server removes minimum", { min: 1 }, {}, true],
  ["client maximum is stricter", { max: 3 }, { max: 5 }, true],
  ["client maximum matches", { max: 5 }, { max: 5 }, true],
  ["server maximum tightens", { max: 5 }, { max: 3 }, false],
  ["server adds a maximum", {}, { max: 5 }, false],
  ["server removes maximum", { max: 5 }, {}, true],
  ["null remains accepted", { nullable: true }, { nullable: true }, true],
  ["server accepts additional null", {}, { nullable: true }, true],
  ["server stops accepting null", { nullable: true }, {}, false],
  ["optional remains optional", { required: false }, { required: false }, true],
  ["server becomes optional", {}, { required: false }, true],
  ["server becomes required", { required: false }, {}, false],
  [
    "identical default",
    { required: false, default: "draft" },
    { required: false, default: "draft" },
    true,
  ],
  [
    "changed default",
    { required: false, default: "draft" },
    { required: false, default: "published" },
    false,
  ],
  ["removed default", { required: false, default: "draft" }, { required: false }, false],
  ["added shared default", { required: false }, { required: false, default: "draft" }, false],
  [
    "identical nullable default",
    { required: false, nullable: true, default: null },
    { required: false, nullable: true, default: null },
    true,
  ],
  [
    "null default differs from missing",
    { required: false, nullable: true, default: null },
    { required: false, nullable: true },
    false,
  ],
  ["same uniqueness", { unique: true }, { unique: true }, true],
  ["server adds uniqueness", {}, { unique: true }, false],
  ["server removes uniqueness", { unique: true }, {}, false],
  ["client choice subset", { choices: ["draft"] }, { choices: ["draft", "published"] }, true],
  [
    "same choices reordered",
    { choices: ["published", "draft"] },
    { choices: ["draft", "published"] },
    true,
  ],
  [
    "client permits an excluded choice",
    { choices: ["draft", "archived"] },
    { choices: ["draft", "published"] },
    false,
  ],
  ["server adds choices", {}, { choices: ["draft"] }, false],
  ["server removes choices", { choices: ["draft"] }, {}, true],
  ["same email format", { format: "email" }, { format: "email" }, true],
  ["server adds email format", {}, { format: "email" }, false],
  ["server removes email format", { format: "email" }, {}, true],
  ["format changes", { format: "email" }, { format: "url" }, false],
  [
    "finite choices do not imply an undeclared format",
    { choices: ["ada@example.com"] },
    { format: "email" },
    false,
  ],
  [
    "editor differs",
    { editor: { type: "textarea", rows: 3 } },
    { editor: { type: "code", language: "markdown" } },
    true,
  ],
];

describe("directional create compatibility", () => {
  test.each(cases)("%s", (_name, client, server, expected) => {
    expect(
      compatibleForCreate(
        description({ title: field(client) }),
        description({ title: field(server) }),
      ),
    ).toBe(expected);
  });

  test("all field conditions must hold, not just the first compatible field", () => {
    const client = description({ title: field({ min: 5 }), slug: field({ max: 12 }) });
    const server = description({ title: field({ min: 3 }), slug: field({ max: 5 }) });
    expect(compatibleForCreate(client, server)).toBe(false);
  });

  test("new optional and defaulted server fields allow old clients to create", () => {
    const client = description();
    expect(
      compatibleForCreate(
        client,
        description({ title: field(), summary: field({ required: false }) }),
      ),
    ).toBe(true);
    expect(
      compatibleForCreate(
        client,
        description({ title: field(), status: field({ required: false, default: "draft" }) }),
      ),
    ).toBe(true);
    expect(compatibleForCreate(client, description({ title: field(), summary: field() }))).toBe(
      false,
    );
  });

  test("a removed client field is incompatible even when optional", () => {
    expect(
      compatibleForCreate(
        description({ title: field(), summary: field({ required: false }) }),
        description(),
      ),
    ).toBe(false);
  });

  test("field declaration order does not affect compatibility", () => {
    expect(
      compatibleForCreate(
        description({ title: field(), summary: field({ required: false }) }),
        description({ summary: field({ required: false }), title: field() }),
      ),
    ).toBe(true);
  });

  test("bounded interval relations hold across independently enumerated endpoints", () => {
    for (const clientMin of [0, 1, 3]) {
      for (const clientMax of [3, 5, 8]) {
        for (const serverMin of [0, 1, 3]) {
          for (const serverMax of [3, 5, 8]) {
            const lengths = [0, 1, 2, 3, 4, 5, 6, 7, 8];
            const clientLengths = lengths.filter(
              (length) => length >= clientMin && length <= clientMax,
            );
            const serverLengths = new Set(
              lengths.filter((length) => length >= serverMin && length <= serverMax),
            );
            const expected = clientLengths.every((length) => serverLengths.has(length));
            expect(
              compatibleForCreate(
                description({ title: field({ min: clientMin, max: clientMax }) }),
                description({ title: field({ min: serverMin, max: serverMax }) }),
              ),
              JSON.stringify({ clientMin, clientMax, serverMin, serverMax }),
            ).toBe(expected);
          }
        }
      }
    }
  });

  test("frozen descriptors remain unchanged across repeated compatibility checks", () => {
    const client = freezeDeep(description({ title: field({ min: 3 }) }));
    const server = freezeDeep(description({ title: field({ min: 1 }) }));
    expect(compatibleForCreate(client, server)).toBe(true);
    expect(compatibleForCreate(server, client)).toBe(false);
    expect(compatibleForCreate(client, server)).toBe(true);
    expect(client).toEqual(description({ title: field({ min: 3 }) }));
  });
});

describe("stored values", () => {
  const schema = description({
    title: field({ min: 1, max: 5 }),
    summary: field({ required: false, nullable: true }),
    status: field({ required: false, choices: ["draft", "published"], default: "draft" }),
  });

  test.each([
    ["saved default", { title: "Hello", status: "draft" }, true],
    ["explicit nullable value", { title: "Hello", status: "draft", summary: null }, true],
    ["empty optional value", { title: "Hello", status: "draft", summary: "" }, true],
    ["missing defaulted output", { title: "Hello" }, false],
    ["undefined defaulted output", { title: "Hello", status: undefined }, false],
    ["unknown field", { title: "Hello", status: "draft", extra: "x" }, false],
    ["invalid title", { title: "", status: "draft" }, false],
    ["wrong value type", { title: 4, status: "draft" }, false],
    ["invalid choice", { title: "Hello", status: "archived" }, false],
    ["root null", null, false],
    ["root array", [], false],
  ])("%s", (_name, input, expected) => {
    expect(validateStored(schema, input)).toBe(expected);
  });

  test("stored validation does not add a missing default", () => {
    const input = { title: "Hello" };
    expect(validateStored(schema, input)).toBe(false);
    expect(Object.hasOwn(input, "status")).toBe(false);
  });

  test("stored text is grapheme-counted and never normalized", () => {
    const exact = description({ title: field({ min: 1, max: 1 }) });
    const input = freezeDeep({ title: "e\u0301" });
    expect(validateStored(exact, input)).toBe(true);
    expect(input.title).toBe("e\u0301");
    expect(validateStored(exact, { title: "éé" })).toBe(false);
  });
});

describe("client output projection", () => {
  const id = "33333333-3333-4333-8333-333333333333";

  test("old clients receive only declared fields plus id", () => {
    const client = description();
    const server = description({ title: field(), summary: field({ required: false }) });
    const input = freezeDeep({ id, title: "Hello", summary: "New field" });
    expect(projectDocument(client, server, input)).toEqual({
      ok: true,
      data: { id, title: "Hello" },
    });
    expect(input).toEqual({ id, title: "Hello", summary: "New field" });
  });

  test("optional omission remains absent while nullable null remains present", () => {
    const client = description({
      title: field(),
      summary: field({ required: false, nullable: true }),
    });
    expect(projectDocument(client, client, { id, title: "Hello" })).toEqual({
      ok: true,
      data: { id, title: "Hello" },
    });
    expect(projectDocument(client, client, { id, title: "Hello", summary: null })).toEqual({
      ok: true,
      data: { id, title: "Hello", summary: null },
    });
  });

  test("an absent defaulted field is a mismatch rather than a fabricated read default", () => {
    const client = description({
      title: field(),
      status: field({ required: false, default: "draft" }),
    });
    const server = description({ title: field(), status: field({ required: false }) });
    expect(projectDocument(client, server, { id, title: "Hello" })).toEqual({
      ok: false,
      error: { code: "schema_mismatch" },
    });
  });

  test("reads use actual output values rather than create compatibility", () => {
    const client = description({ title: field({ min: 5 }) });
    const server = description({ title: field() });
    expect(projectDocument(client, server, { id, title: "Hello" })).toEqual({
      ok: true,
      data: { id, title: "Hello" },
    });
    expect(projectDocument(client, server, { id, title: "Hi" })).toEqual({
      ok: false,
      error: { code: "schema_mismatch" },
    });
  });

  test("a removed local field is a mismatch even when absent and optional", () => {
    const client = description({ title: field(), summary: field({ required: false }) });
    expect(projectDocument(client, description(), { id, title: "Hello" })).toEqual({
      ok: false,
      error: { code: "schema_mismatch" },
    });
  });

  test("projection preserves legal prototype-like own fields without prototype mutation", () => {
    const schema = description(
      Object.fromEntries([
        ["__proto__", field()],
        ["constructor", field()],
      ]),
    );
    const document = Object.fromEntries([
      ["id", id],
      ["__proto__", "Proto"],
      ["constructor", "Ctor"],
    ]) as { id: string } & Record<string, string>;
    const result = projectDocument(schema, schema, document);
    expect(result).toEqual({ ok: true, data: document });
    if (!result.ok) throw new Error("Expected legal own fields to project");
    expect(Object.hasOwn(result.data, "__proto__")).toBe(true);
    expect(Object.hasOwn(result.data, "constructor")).toBe(true);
    expect([Object.prototype, null]).toContain(Object.getPrototypeOf(result.data));
    expect({}.constructor).toBe(Object);
  });

  test("null cannot pass a nonnullable client output contract", () => {
    const client: CollectionDescription = description();
    const server = description({ title: field({ nullable: true }) });
    expect(projectDocument(client, server, { id, title: null })).toEqual({
      ok: false,
      error: { code: "schema_mismatch" },
    });
  });
});
