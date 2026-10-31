import type {
  CollectionDescription,
  ExpectedType,
  FieldDescription,
  ValidationIssue,
} from "@aircastle/schema";
import { describe, expect, test } from "vite-plus/test";
import {
  parseContentError,
  projectDocument,
  validateStored,
  type ContentDocument,
  type DocumentData,
} from "./index.ts";
import { freezeDeep } from "./support/fixtures.ts";

const text = { type: "text", required: true, nullable: false, unique: false } as const;
const optionalText = { ...text, required: false } as const;

function object(fields: Record<string, FieldDescription>): FieldDescription {
  return { type: "object", required: true, nullable: false, fields };
}

function list(item: FieldDescription): FieldDescription {
  return { type: "list", required: true, nullable: false, item };
}

function blocks(variants: Record<string, Record<string, FieldDescription>>): FieldDescription {
  return {
    type: "blocks",
    required: true,
    nullable: false,
    variants: Object.fromEntries(
      Object.entries(variants).map(([name, fields]) => [
        name,
        { type: "object", required: true, nullable: false, fields },
      ]),
    ),
  };
}

describe("stored values compare deeply", () => {
  const schema: CollectionDescription = {
    fields: {
      rating: { type: "number", required: true, nullable: false, integer: false },
      seo: object({
        title: text,
        description: optionalText,
        slug: { ...optionalText, default: "" },
      }),
      rows: list(object({ label: text, tone: { ...optionalText, default: "plain" } })),
      times: list({ type: "datetime", required: true, nullable: false }),
      schedule: object({ at: { type: "datetime", required: true, nullable: false } }),
      meta: { type: "json", required: true, nullable: false },
      location: { type: "point", required: true, nullable: false },
      updatedAt: { type: "datetime", required: true, nullable: false },
      layout: blocks({ hero: { heading: text } }),
      related: {
        type: "reference",
        required: true,
        nullable: false,
        collections: ["posts", "pages"],
      },
    },
  };
  const stored: DocumentData = {
    rating: 4.5,
    seo: { title: "Hello", slug: "" },
    rows: [{ id: "r1", label: "x", tone: "plain" }],
    times: ["2026-02-13T22:00:00.000Z"],
    schedule: { at: "2026-02-13T22:00:00.000Z" },
    meta: { a: [1, { b: 0 }], c: null },
    location: { lat: -33.86, lng: 151.21 },
    updatedAt: "2026-02-13T22:00:00.000Z",
    layout: [{ type: "hero", id: "b1", heading: "Hi" }],
    related: { collection: "posts", id: "p1" },
  };

  test("a stored document equal to its validated output passes", () => {
    expect(validateStored(schema, freezeDeep(structuredClone(stored)))).toBe(true);
  });

  test("object key order at every depth does not matter", () => {
    const reordered: DocumentData = {
      related: { id: "p1", collection: "posts" },
      layout: [{ heading: "Hi", id: "b1", type: "hero" }],
      updatedAt: "2026-02-13T22:00:00.000Z",
      location: { lng: 151.21, lat: -33.86 },
      meta: { c: null, a: [1, { b: 0 }] },
      schedule: { at: "2026-02-13T22:00:00.000Z" },
      times: ["2026-02-13T22:00:00.000Z"],
      rows: [{ tone: "plain", label: "x", id: "r1" }],
      seo: { slug: "", title: "Hello" },
      rating: 4.5,
    };
    expect(validateStored(schema, reordered)).toBe(true);
  });

  test("zero stored inside lists and json passes", () => {
    const zeros: DocumentData = {
      ...stored,
      rating: 0,
      meta: [0, { b: [0] }],
      location: { lat: 0, lng: 0 },
    };
    expect(validateStored(schema, zeros)).toBe(true);
  });

  test.each([
    ["a missing nested default", { ...stored, seo: { title: "Hello" } }],
    ["a nested unknown key", { ...stored, seo: { title: "Hello", slug: "", extra: "x" } }],
    [
      "an explicit undefined nested optional field",
      { ...stored, seo: { title: "Hello", slug: "", description: undefined } },
    ],
    ["a datetime that is not normalized", { ...stored, updatedAt: "2026-02-14T09:00+11:00" }],
    [
      "a row with an unknown key",
      { ...stored, rows: [{ id: "r1", label: "x", tone: "plain", extra: 1 }] },
    ],
    ["a row missing a defaulted nested field", { ...stored, rows: [{ id: "r1", label: "x" }] }],
    ["a list datetime that is not normalized", { ...stored, times: ["2026-02-14T09:00+11:00"] }],
    [
      "an object datetime that is not normalized",
      { ...stored, schedule: { at: "2026-02-14T09:00+11:00" } },
    ],
    ["a block of an unknown type", { ...stored, layout: [{ type: "video", id: "b1" }] }],
    ["a point with an extra key", { ...stored, location: { lat: 1, lng: 2, alt: 3 } }],
    ["a numeric string", { ...stored, rating: "4.5" }],
  ])("a stored document with %s fails", (_name, input) => {
    expect(validateStored(schema, input)).toBe(false);
  });
});

describe("older clients read newer documents", () => {
  const id = "33333333-3333-4333-8333-333333333333";

  test("a nested field the client lacks is left out", () => {
    const client: CollectionDescription = { fields: { seo: object({ title: text }) } };
    const server: CollectionDescription = {
      fields: { seo: object({ title: text, slug: { ...optionalText, default: "" } }) },
    };
    const document = freezeDeep({ id, seo: { title: "Hello", slug: "" } });
    expect(projectDocument(client, server, document)).toEqual({
      ok: true,
      data: { id, seo: { title: "Hello" } },
    });
    expect(document).toEqual({ id, seo: { title: "Hello", slug: "" } });
  });

  test("a block type the client lacks is dropped", () => {
    const client: CollectionDescription = {
      fields: { layout: blocks({ hero: { heading: text } }) },
    };
    const server: CollectionDescription = {
      fields: { layout: blocks({ hero: { heading: text }, video: { url: text } }) },
    };
    const document: ContentDocument = {
      id,
      layout: [
        { type: "hero", id: "b1", heading: "Hi" },
        { type: "video", id: "b2", url: "https://example.com/v" },
      ],
    };
    expect(projectDocument(client, server, document)).toEqual({
      ok: true,
      data: { id, layout: [{ type: "hero", id: "b1", heading: "Hi" }] },
    });
  });

  test("rows, variants and blocks inside lists are projected at every depth", () => {
    const client: CollectionDescription = {
      fields: {
        sections: list(object({ heading: text, layout: blocks({ hero: { heading: text } }) })),
      },
    };
    const server: CollectionDescription = {
      fields: {
        sections: list(
          object({
            heading: text,
            note: optionalText,
            layout: blocks({
              hero: { heading: text, subtitle: optionalText },
              video: { url: text },
            }),
          }),
        ),
      },
    };
    const document = freezeDeep({
      id,
      sections: [
        {
          id: "s1",
          heading: "A",
          note: "n",
          layout: [
            { type: "hero", id: "b1", heading: "Hi", subtitle: "Sub" },
            { type: "video", id: "b2", url: "u" },
          ],
        },
        { id: "s2", heading: "B", layout: [{ type: "video", id: "b3", url: "v" }] },
      ],
    });
    expect(projectDocument(client, server, document)).toEqual({
      ok: true,
      data: {
        id,
        sections: [
          { id: "s1", heading: "A", layout: [{ type: "hero", id: "b1", heading: "Hi" }] },
          { id: "s2", heading: "B", layout: [] },
        ],
      },
    });
  });

  test("blocks nested inside blocks drop unknown types", () => {
    const client: CollectionDescription = {
      fields: { layout: blocks({ columns: { items: blocks({ text: { body: text } }) } }) },
    };
    const server: CollectionDescription = {
      fields: {
        layout: blocks({
          columns: { items: blocks({ text: { body: text }, image: { src: text } }) },
        }),
      },
    };
    const document: ContentDocument = {
      id,
      layout: [
        {
          type: "columns",
          id: "c1",
          items: [
            { type: "image", id: "i1", src: "y" },
            { type: "text", id: "t1", body: "x" },
          ],
        },
      ],
    };
    expect(projectDocument(client, server, document)).toEqual({
      ok: true,
      data: {
        id,
        layout: [{ type: "columns", id: "c1", items: [{ type: "text", id: "t1", body: "x" }] }],
      },
    });
  });

  test("a kept nested value that breaks the client contract is a mismatch", () => {
    const client: CollectionDescription = {
      fields: { seo: object({ title: { ...text, max: 3 } }) },
    };
    const server: CollectionDescription = { fields: { seo: object({ title: text }) } };
    expect(projectDocument(client, server, { id, seo: { title: "Hello" } })).toEqual({
      ok: false,
      error: { code: "schema_mismatch" },
    });
  });
});

const message = "Readable diagnostic wording";

function wrapped(value: unknown) {
  return { code: "validation_failed", issues: [value] };
}

const plainCodes = [
  "not_integer",
  "invalid_date",
  "invalid_datetime",
  "invalid_list",
  "invalid_object",
  "invalid_reference",
  "invalid_id",
  "invalid_json",
  "invalid_point",
] as const;
const expectedTypes: readonly ExpectedType[] = [
  "string",
  "number",
  "boolean",
  "array",
  "object",
  "json",
];
const detailed: readonly ValidationIssue[] = [
  { code: "too_small", path: ["score"], message, minimum: -1.5, actual: -2.25 },
  { code: "too_small", path: ["rating"], message, minimum: 1, actual: 0 },
  { code: "too_large", path: ["score"], message, maximum: 0.5, actual: 0.75 },
  { code: "too_large", path: ["score"], message, maximum: -1, actual: -0.5 },
  {
    code: "too_early",
    path: ["updatedAt"],
    message,
    minimum: "2026-01-01T00:00:00.000Z",
    actual: "2025-12-31T23:59:00.000Z",
  },
  { code: "too_late", path: ["publishedOn"], message, maximum: "2026-12-31", actual: "2027-01-01" },
  { code: "too_few", path: ["tags"], message, minimum: 1, actual: 0 },
  { code: "too_many", path: ["tags"], message, maximum: 10, actual: 11 },
  {
    code: "out_of_range",
    path: ["location", "lat"],
    message,
    minimum: -90,
    maximum: 90,
    actual: 90.1,
  },
  {
    code: "out_of_range",
    path: ["location", "lng"],
    message,
    minimum: -180,
    maximum: 180,
    actual: -180.5,
  },
  { code: "not_found", path: ["coauthors", 1], message, collection: "authors" },
  { code: "not_found", path: ["related"], message, collection: "pages" },
  { code: "invalid_block_type", path: ["layout", 0], message, allowed: ["hero", "quote"] },
  { code: "duplicate_id", path: ["rows", 1, "id"], message, firstIndex: 0 },
  {
    code: "invalid_choice",
    path: ["related", "collection"],
    message,
    allowed: ["posts", "pages"],
  },
];

describe("content errors carry every new issue", () => {
  test.each(plainCodes)("accepts %s", (code) => {
    const value: ValidationIssue = { code, path: ["sections", 0, "value"], message };
    expect(parseContentError(wrapped(value))).toEqual({
      code: "validation_failed",
      issues: [value],
    });
  });

  test.each(expectedTypes)("accepts invalid_type expecting %s", (expected) => {
    const value: ValidationIssue = {
      code: "invalid_type",
      path: ["value"],
      message,
      expected,
      received: "null",
    };
    expect(parseContentError(wrapped(value))).toEqual({
      code: "validation_failed",
      issues: [value],
    });
  });

  test.each(detailed)("accepts $code at $path with its exact details", (value) => {
    expect(parseContentError(wrapped(value))).toEqual({
      code: "validation_failed",
      issues: [value],
    });
  });

  test("keeps mixed old and new issues in order", () => {
    const issues = [
      { code: "required", path: ["title"], message },
      detailed[0]!,
      { code: "invalid_date", path: ["publishedOn"], message },
      detailed[12]!,
    ];
    expect(parseContentError({ code: "validation_failed", issues })).toEqual({
      code: "validation_failed",
      issues,
    });
  });
});

describe("malformed new issue details", () => {
  const nonfinite = [undefined, null, "1", NaN, Infinity, -Infinity];
  const noncount = [undefined, null, "1", -1, 0.5, NaN, Infinity];
  const nonstring = [undefined, null, 1, ["2026-01-01"]];

  function malformed(issue: ValidationIssue, keys: readonly string[], values: readonly unknown[]) {
    return keys.flatMap((key) =>
      values.map((value) => ({ code: issue.code, key, label: String(value), issue, value })),
    );
  }

  test.each([
    ...malformed(detailed[0]!, ["minimum", "actual"], nonfinite),
    ...malformed(detailed[2]!, ["maximum", "actual"], nonfinite),
    ...malformed(detailed[8]!, ["minimum", "maximum", "actual"], nonfinite),
    ...malformed(detailed[4]!, ["minimum", "actual"], nonstring),
    ...malformed(detailed[5]!, ["maximum", "actual"], nonstring),
    ...malformed(detailed[6]!, ["minimum", "actual"], noncount),
    ...malformed(detailed[7]!, ["maximum", "actual"], noncount),
    ...malformed(detailed[13]!, ["firstIndex"], noncount),
    ...malformed(detailed[10]!, ["collection"], [undefined, null, 1, ["authors"]]),
    ...malformed(detailed[12]!, ["allowed"], [undefined, null, "hero", ["hero", 1]]),
  ])("rejects $code with $key set to $label", ({ issue, key, value }) => {
    expect(parseContentError(wrapped({ ...issue, [key]: value }))).toBeUndefined();
  });

  test.each(["date", "integer", "list", undefined, 1])(
    "rejects invalid_type expecting %s",
    (expected) => {
      expect(
        parseContentError(
          wrapped({ code: "invalid_type", path: ["value"], message, expected, received: "null" }),
        ),
      ).toBeUndefined();
    },
  );

  test.each(["too_big", "invalid_number", "not_a_date"])("rejects the unknown code %s", (code) => {
    expect(parseContentError(wrapped({ code, path: ["value"], message }))).toBeUndefined();
  });
});
