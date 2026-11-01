import type { CollectionDescription, FieldDescription } from "@aircastle/schema";
import { describe, expect, test } from "vite-plus/test";
import { compatibleForCreate } from "./index.ts";

const text = { type: "text", required: true, nullable: false, unique: false } as const;
const number = { type: "number", required: true, nullable: false, integer: false } as const;
const boolean = { type: "boolean", required: true, nullable: false } as const;
const date = { type: "date", required: true, nullable: false } as const;
const datetime = { type: "datetime", required: true, nullable: false } as const;
const json = { type: "json", required: true, nullable: false } as const;
const point = { type: "point", required: true, nullable: false } as const;

function list(item: FieldDescription, extra: object = {}): FieldDescription {
  return { type: "list", required: true, nullable: false, item, ...extra } as FieldDescription;
}

function object(fields: Record<string, FieldDescription>, extra: object = {}): FieldDescription {
  return { type: "object", required: true, nullable: false, fields, ...extra } as FieldDescription;
}

function blocks(
  variants: Record<string, Record<string, FieldDescription>>,
  extra: object = {},
): FieldDescription {
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
    ...extra,
  } as FieldDescription;
}

function single(collection: string): FieldDescription {
  return { type: "reference", required: true, nullable: false, collection };
}

function multi(collections: readonly string[]): FieldDescription {
  return { type: "reference", required: true, nullable: false, collections };
}

function of(value: FieldDescription): CollectionDescription {
  return { fields: { value } };
}

const cases: readonly [string, FieldDescription, FieldDescription, boolean][] = [
  ["text client against number server", text, number, false],
  ["number client against text server", number, text, false],
  ["date client against datetime server", date, datetime, false],
  ["json client against text server", json, text, false],
  ["point client against json server", point, json, false],
  ["list client against blocks server", list(text), blocks({ hero: {} }), false],

  ["server integer needs client integer", number, { ...number, integer: true }, false],
  ["both integer", { ...number, integer: true }, { ...number, integer: true }, true],
  ["client integer against fractional server", { ...number, integer: true }, number, true],

  ["client numeric minimum is stricter", { ...number, min: 2 }, { ...number, min: 1 }, true],
  ["server numeric minimum tightens", { ...number, min: 1 }, { ...number, min: 2 }, false],
  ["server adds a numeric minimum", number, { ...number, min: 0 }, false],
  ["server removes a numeric minimum", { ...number, min: 0 }, number, true],
  [
    "client fractional minimum is stricter",
    { ...number, min: 0.5 },
    { ...number, min: 0.25 },
    true,
  ],
  ["server negative minimum tightens", { ...number, min: -2.5 }, { ...number, min: -1.5 }, false],
  ["client numeric maximum is stricter", { ...number, max: 4 }, { ...number, max: 5 }, true],
  ["server numeric maximum tightens", { ...number, max: 5 }, { ...number, max: 4.5 }, false],
  ["server adds a numeric maximum", number, { ...number, max: 5 }, false],
  ["server removes a numeric maximum", { ...number, max: 5 }, number, true],
  [
    "numeric bounds matching on both sides",
    { ...number, integer: true, min: 1, max: 5 },
    { ...number, integer: true, min: 1, max: 5 },
    true,
  ],

  [
    "client date minimum is later",
    { ...date, min: "2026-02-01" },
    { ...date, min: "2026-01-31" },
    true,
  ],
  [
    "server date minimum moves later",
    { ...date, min: "2026-01-31" },
    { ...date, min: "2026-02-01" },
    false,
  ],
  ["server adds a date maximum", date, { ...date, max: "2026-12-31" }, false],
  ["server removes a date maximum", { ...date, max: "2026-12-31" }, date, true],
  [
    "server date maximum moves earlier",
    { ...date, max: "2027-01-01" },
    { ...date, max: "2026-12-31" },
    false,
  ],
  [
    "client datetime maximum is earlier",
    { ...datetime, max: "2026-02-13T22:00:00.000Z" },
    { ...datetime, max: "2026-02-13T22:00:00.001Z" },
    true,
  ],
  [
    "server datetime minimum moves later",
    { ...datetime, min: "2026-02-13T22:00:00.000Z" },
    { ...datetime, min: "2026-02-13T22:00:00.001Z" },
    false,
  ],

  ["identical booleans", boolean, boolean, true],
  ["boolean editors are ignored", { ...boolean, editor: { type: "switch" } }, boolean, true],
  ["boolean editor added on the server", boolean, { ...boolean, editor: { type: "switch" } }, true],
  [
    "changed boolean default",
    { ...boolean, required: false, default: false },
    { ...boolean, required: false, default: true },
    false,
  ],
  ["server stops accepting null numbers", { ...number, nullable: true }, number, false],
  ["server becomes optional", date, { ...date, required: false }, true],
  ["server becomes required", { ...date, required: false }, date, false],

  ["list items of the same kind", list(text), list(text), true],
  ["list item kind changes", list(text), list(number), false],
  [
    "client list item bound is stricter",
    list({ ...text, max: 20 }),
    list({ ...text, max: 30 }),
    true,
  ],
  [
    "server list item bound tightens",
    list({ ...text, max: 30 }),
    list({ ...text, max: 20 }),
    false,
  ],
  ["server list item needs integers", list(number), list({ ...number, integer: true }), false],
  [
    "client nullable item against nonnullable server item",
    list({ ...number, nullable: true }),
    list(number),
    false,
  ],
  ["server accepts additional null items", list(number), list({ ...number, nullable: true }), true],
  [
    "client list count is stricter",
    list(text, { min: 2, max: 3 }),
    list(text, { min: 1, max: 4 }),
    true,
  ],
  ["server adds a list minimum count", list(text), list(text, { min: 1 }), false],
  ["server lowers the list maximum count", list(text, { max: 5 }), list(text, { max: 4 }), false],
  ["nested list item kinds are compared", list(list(text)), list(list(number)), false],

  ["identical objects", object({ a: text }), object({ a: text }), true],
  [
    "server adds an optional nested field",
    object({ a: text }),
    object({ a: text, b: { ...text, required: false } }),
    true,
  ],
  [
    "server adds a defaulted nested field",
    object({ a: text }),
    object({ a: text, slug: { ...text, required: false, default: "" } }),
    true,
  ],
  ["server adds a required nested field", object({ a: text }), object({ a: text, b: text }), false],
  [
    "server removes a nested field",
    object({ a: text, b: { ...text, required: false } }),
    object({ a: text }),
    false,
  ],
  ["nested field kind changes", object({ a: text }), object({ a: number }), false],
  [
    "server nested bound tightens",
    object({ a: { ...number, max: 5 } }),
    object({ a: { ...number, max: 4 } }),
    false,
  ],
  [
    "client nested bound is stricter",
    object({ a: { ...number, max: 4 } }),
    object({ a: { ...number, max: 5 } }),
    true,
  ],
  [
    "server nested field stops accepting null",
    object({ a: { ...text, nullable: true } }),
    object({ a: text }),
    false,
  ],
  [
    "server nested field becomes required",
    object({ a: { ...text, required: false } }),
    object({ a: text }),
    false,
  ],
  [
    "nested editors are ignored",
    object({ a: { ...text, editor: { type: "textarea", rows: 3 } }, b: boolean }),
    object({ a: text, b: { ...boolean, editor: { type: "switch" } } }),
    true,
  ],
  ["server object stops accepting null", object({}, { nullable: true }), object({}), false],
  ["server object becomes required", object({}, { required: false }), object({}), false],
  [
    "nested field order does not matter",
    object({ a: text, b: number }),
    object({ b: number, a: text }),
    true,
  ],
  ["list row fields recurse", list(object({ a: text })), list(object({ a: text, b: text })), false],

  [
    "client variants are a subset",
    blocks({ hero: { heading: text } }),
    blocks({ hero: { heading: text }, quote: { text } }),
    true,
  ],
  [
    "client has a variant the server lacks",
    blocks({ hero: { heading: text }, quote: { text } }),
    blocks({ hero: { heading: text } }),
    false,
  ],
  [
    "server variant adds a required field",
    blocks({ hero: { heading: text } }),
    blocks({ hero: { heading: text, image: text } }),
    false,
  ],
  [
    "server variant adds an optional field",
    blocks({ hero: { heading: text } }),
    blocks({ hero: { heading: text, image: { ...text, required: false } } }),
    true,
  ],
  [
    "client variant declares a field the server variant lacks",
    blocks({ hero: { heading: text, image: { ...text, required: false } } }),
    blocks({ hero: { heading: text } }),
    false,
  ],
  [
    "variant field kind changes",
    blocks({ hero: { heading: text } }),
    blocks({ hero: { heading: number } }),
    false,
  ],
  ["client block count is stricter", blocks({ hero: {} }, { min: 1 }), blocks({ hero: {} }), true],
  [
    "server adds a block count maximum",
    blocks({ hero: {} }),
    blocks({ hero: {} }, { max: 3 }),
    false,
  ],

  ["same single reference", single("authors"), single("authors"), true],
  ["single reference retargeted", single("authors"), single("users"), false],
  [
    "single client against multi server with the same name",
    single("authors"),
    multi(["authors"]),
    false,
  ],
  [
    "multi client against single server with the same name",
    multi(["authors"]),
    single("authors"),
    false,
  ],
  [
    "client multi-reference collections are a subset",
    multi(["posts"]),
    multi(["posts", "pages"]),
    true,
  ],
  [
    "same multi-reference collections reordered",
    multi(["pages", "posts"]),
    multi(["posts", "pages"]),
    true,
  ],
  [
    "client multi-reference names an extra collection",
    multi(["posts", "pages"]),
    multi(["posts"]),
    false,
  ],
  [
    "server reference stops accepting null",
    { ...single("authors"), nullable: true },
    single("authors"),
    false,
  ],

  ["identical json", json, json, true],
  ["server json becomes required", { ...json, required: false }, json, false],
  ["server json stops accepting null", { ...json, nullable: true }, json, false],
  [
    "json defaults equal with different key order",
    { ...json, required: false, default: { a: 1, b: [true, null, { c: "x", d: 2 }] } },
    { ...json, required: false, default: { b: [true, null, { d: 2, c: "x" }], a: 1 } },
    true,
  ],
  [
    "json defaults differ deep inside",
    { ...json, required: false, default: { a: [1, 2] } },
    { ...json, required: false, default: { a: [2, 1] } },
    false,
  ],
  [
    "json default added on the server",
    { ...json, required: false },
    { ...json, required: false, default: {} },
    false,
  ],
  [
    "json null default removed on the server",
    { ...json, required: false, nullable: true, default: null },
    { ...json, required: false, nullable: true },
    false,
  ],

  ["identical points", point, point, true],
  ["server point becomes required", { ...point, required: false }, point, false],
  ["server point stops accepting null", { ...point, nullable: true }, point, false],
  [
    "point defaults equal with different key order",
    { ...point, required: false, default: { lat: -33.86, lng: 151.21 } },
    { ...point, required: false, default: { lng: 151.21, lat: -33.86 } },
    true,
  ],
  [
    "point defaults differ",
    { ...point, required: false, default: { lat: 10, lng: 20 } },
    { ...point, required: false, default: { lat: 20, lng: 10 } },
    false,
  ],
];

describe("create compatibility for every field kind", () => {
  test.each(cases)("%s", (_name, client, server, expected) => {
    expect(compatibleForCreate(of(client), of(server))).toBe(expected);
  });

  test.each(
    cases.flatMap(([name, client, server]) => [
      [`${name}, client side`, client],
      [`${name}, server side`, server],
    ]),
  )("%s is compatible with an independent copy of itself", (_name, value) => {
    expect(compatibleForCreate(of(value), of(structuredClone(value)))).toBe(true);
  });

  test("an older client omitting a new optional nested field inside a list of blocks stays compatible", () => {
    const client = of(
      list(blocks({ hero: { seo: object({ title: text }) } }), { required: false }),
    );
    const server = of(
      list(
        blocks({
          hero: {
            seo: object({ title: text, slug: { ...text, required: false, default: "" } }),
          },
        }),
        { required: false },
      ),
    );
    expect(compatibleForCreate(client, server)).toBe(true);
    expect(compatibleForCreate(server, client)).toBe(false);
  });
});
