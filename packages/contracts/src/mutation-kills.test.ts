import {
  blocks,
  collection,
  json,
  list,
  object,
  point,
  reference,
  text,
  type CollectionDescription,
  type FieldDescription,
} from "@aircastle/schema";
import { describe, expect, test } from "vite-plus/test";
import {
  assignIds,
  compatibleForCreate,
  describeCollections,
  documentReferences,
  parseCollections,
  projectDocument,
  validateStored,
  type DocumentData,
} from "./index.ts";

const invalidRequest = { ok: false, error: { code: "invalid_request" } };
const plainText = { type: "text", required: true, nullable: false, unique: false } as const;
const authors: CollectionDescription = { fields: { name: plainText } };

function withField(name: string, definition: unknown) {
  return [
    { name: "authors", description: authors },
    { name: "articles", description: { fields: { [name]: definition } } },
  ];
}

function articlesDescription(definitions: Parameters<typeof collection>[0]): CollectionDescription {
  const published = describeCollections({
    authors: collection({ name: text() }),
    pages: collection({ title: text() }),
    articles: collection(definitions),
  });
  return published.find((entry) => entry.name === "articles")!.description;
}

describe("wire round-trips of optional per-kind keys", () => {
  test.each([
    [
      "date with a default",
      { type: "date", required: false, nullable: false, default: "2026-02-14" },
    ],
    [
      "datetime with a maximum",
      { type: "datetime", required: true, nullable: false, max: "2026-12-31T00:00:00.000Z" },
    ],
    [
      "datetime with a default",
      {
        type: "datetime",
        required: false,
        nullable: false,
        default: "2026-02-13T22:00:00.000Z",
      },
    ],
    [
      "list with a minimum",
      { type: "list", required: true, nullable: false, min: 1, item: plainText },
    ],
    [
      "object with a default",
      {
        type: "object",
        required: false,
        nullable: false,
        default: { a: "x" },
        fields: { a: { ...plainText, required: false } },
      },
    ],
    [
      "blocks with a maximum",
      {
        type: "blocks",
        required: true,
        nullable: false,
        max: 3,
        variants: { hero: { type: "object", required: true, nullable: false, fields: {} } },
      },
    ],
    [
      "blocks with a default",
      {
        type: "blocks",
        required: false,
        nullable: false,
        default: [],
        variants: { hero: { type: "object", required: true, nullable: false, fields: {} } },
      },
    ],
  ])("parseCollections accepts a %s unchanged", (_name, definition) => {
    const input = withField("value", definition);
    expect(parseCollections(input)).toEqual({ ok: true, data: input });
  });
});

describe("malformed wire descriptions", () => {
  test.each([
    { type: "switch", rows: 3 },
    { type: "switch", language: "ts" },
  ])("boolean rejects the switch editor with an extra key %j", (editor) => {
    expect(
      parseCollections(
        withField("value", { type: "boolean", required: true, nullable: false, editor }),
      ),
    ).toEqual(invalidRequest);
  });

  test("a field whose type is an array holding a kind name is rejected", () => {
    expect(parseCollections(withField("value", { ...plainText, type: ["text"] }))).toEqual(
      invalidRequest,
    );
  });
});

describe("a collection named wire", () => {
  test("may reference itself", () => {
    const input = [
      {
        name: "wire",
        description: {
          fields: {
            title: plainText,
            parent: { type: "reference", required: false, nullable: true, collection: "wire" },
          },
        },
      },
    ];
    expect(parseCollections(input)).toEqual({ ok: true, data: input });
  });

  test("may be referenced by another collection", () => {
    const input = [
      { name: "wire", description: { fields: { title: plainText } } },
      {
        name: "articles",
        description: {
          fields: {
            title: plainText,
            source: { type: "reference", required: true, nullable: false, collection: "wire" },
            related: {
              type: "reference",
              required: false,
              nullable: false,
              collections: ["wire", "articles"],
            },
          },
        },
      },
    ];
    expect(parseCollections(input)).toEqual({ ok: true, data: input });
  });
});

describe("create compatibility of bounds and json defaults", () => {
  const number = { type: "number", required: true, nullable: false, integer: false } as const;
  const date = { type: "date", required: true, nullable: false } as const;
  const optionalJson = { type: "json", required: false, nullable: false } as const;
  const of = (value: FieldDescription): CollectionDescription => ({ fields: { value } });

  test.each([
    ["a lower client number minimum", { ...number, min: 1 }, { ...number, min: 5 }, false],
    ["a higher client number maximum", { ...number, max: 10 }, { ...number, max: 5 }, false],
    ["an equal number minimum", { ...number, min: 5 }, { ...number, min: 5 }, true],
    ["a tighter client number maximum", { ...number, max: 4 }, { ...number, max: 5 }, true],
    [
      "an earlier client date minimum",
      { ...date, min: "2000-01-01" },
      { ...date, min: "2020-01-01" },
      false,
    ],
    [
      "a later client date maximum",
      { ...date, max: "2030-01-01" },
      { ...date, max: "2020-01-01" },
      false,
    ],
    [
      "a json object default against an array default",
      { ...optionalJson, default: { length: 0 } },
      { ...optionalJson, default: [] },
      false,
    ],
    [
      "a json array default against an object default",
      { ...optionalJson, default: [] },
      { ...optionalJson, default: { length: 0 } },
      false,
    ],
    [
      "a shorter json array default",
      { ...optionalJson, default: [1] },
      { ...optionalJson, default: [1, 2] },
      false,
    ],
    [
      "json array defaults that differ after the first entry",
      { ...optionalJson, default: [1, 2] },
      { ...optionalJson, default: [1, 3] },
      false,
    ],
    [
      "deep-equal json array defaults",
      { ...optionalJson, default: [1, { a: [2] }] },
      { ...optionalJson, default: [1, { a: [2] }] },
      true,
    ],
  ] as const)("%s is %s", (_name, client, server, expected) => {
    expect(
      compatibleForCreate(of(client as FieldDescription), of(server as FieldDescription)),
    ).toBe(expected);
  });
});

describe("documentReferences", () => {
  const description = articlesDescription({
    author: reference("authors"),
    editor: reference("authors").nullable(),
    reviewer: reference("authors").optional(),
    seo: object({ by: reference("authors") }),
    extra: object({ by: reference("authors") }).nullable(),
    source: object({ collection: text(), id: text() }),
    rows: list(object({ who: reference("authors") })),
    maybeRows: list(object({ who: reference("authors") }).nullable()),
    writers: list(reference("authors")),
    others: list(reference("authors")).nullable(),
    nested: list(list(reference("authors"))),
    layout: blocks({
      hero: object({ heading: text() }),
      link: object({ target: reference(["articles", "pages"]) }),
    }),
    meta: json(),
    home: point().nullable(),
    related: reference(["articles", "pages"]),
    maybeRelated: reference(["articles", "pages"]).nullable(),
  });
  const data: DocumentData = {
    author: "a1",
    editor: null,
    seo: { by: "a2" },
    extra: null,
    source: { collection: "authors", id: "not-a-reference" },
    rows: [
      { id: "r1", who: "a3" },
      { id: "r2", who: "a4" },
    ],
    maybeRows: [null, { id: "r3", who: "a5" }],
    writers: ["a6", "a7"],
    others: null,
    nested: [["a8"], [], ["a9", "a10"]],
    layout: [
      { type: "hero", id: "b1", heading: "Hi" },
      { type: "link", id: "b2", target: { collection: "pages", id: "p1" } },
    ],
    meta: [{ type: "link", target: { collection: "pages", id: "p9" } }],
    home: null,
    related: { collection: "articles", id: "x1" },
    maybeRelated: null,
  };

  test("the fixture is a stored-valid document", () => {
    expect(validateStored(description, data)).toBe(true);
  });

  test("lists every non-null reference with its path, depth first in declaration order", () => {
    expect(documentReferences(description, data)).toEqual([
      { path: ["author"], collection: "authors", id: "a1" },
      { path: ["seo", "by"], collection: "authors", id: "a2" },
      { path: ["rows", 0, "who"], collection: "authors", id: "a3" },
      { path: ["rows", 1, "who"], collection: "authors", id: "a4" },
      { path: ["maybeRows", 1, "who"], collection: "authors", id: "a5" },
      { path: ["writers", 0], collection: "authors", id: "a6" },
      { path: ["writers", 1], collection: "authors", id: "a7" },
      { path: ["nested", 0, 0], collection: "authors", id: "a8" },
      { path: ["nested", 2, 0], collection: "authors", id: "a9" },
      { path: ["nested", 2, 1], collection: "authors", id: "a10" },
      { path: ["layout", 1, "target"], collection: "pages", id: "p1" },
      { path: ["related"], collection: "articles", id: "x1" },
    ]);
  });

  test("empty lists and null containers add no references", () => {
    expect(
      documentReferences(description, {
        author: "a1",
        editor: null,
        seo: { by: "a2" },
        extra: null,
        source: { collection: "authors", id: "x" },
        rows: [],
        maybeRows: [],
        writers: [],
        others: [],
        nested: [],
        layout: [],
        meta: null,
        home: null,
        related: { collection: "pages", id: "p2" },
        maybeRelated: null,
      }).map(({ path }) => path),
    ).toEqual([["author"], ["seo", "by"], ["related"]]);
  });
});

describe("assignIds", () => {
  const description = articlesDescription({
    title: text(),
    rows: list(object({ label: text() })),
    maybeRows: list(object({ label: text() }).nullable()),
    tags: list(text()),
    targets: list(reference(["articles", "pages"])),
    others: list(object({ label: text() })).nullable(),
    seo: object({ links: list(object({ href: text() })) }),
    plain: object({ id: text() }),
    layout: blocks({
      hero: object({ heading: text() }),
      gallery: object({
        images: list(object({ src: text() })),
        inner: blocks({ quote: object({ text: text() }) }),
      }),
    }),
    meta: json(),
    home: point(),
    related: reference(["articles", "pages"]),
  });
  const fresh = () => "fresh";

  test("gives every block and object row without an id a new one, at any depth", () => {
    const data: DocumentData = {
      title: "Hi",
      rows: [{ label: "a" }, { id: "kept-row", label: "b" }],
      maybeRows: [null, { label: "c" }],
      tags: ["x", "y"],
      targets: [{ collection: "pages", id: "p1" }],
      others: null,
      seo: { links: [{ href: "/a" }] },
      plain: { id: "plain-id" },
      layout: [
        { type: "hero", heading: "Hi" },
        { type: "hero", id: "kept-block", heading: "Again" },
        {
          type: "gallery",
          images: [{ src: "a.png" }, { id: "kept-image", src: "b.png" }],
          inner: [{ type: "quote", text: "q" }],
        },
      ],
      meta: [{ type: "hero", heading: "not a block" }, { label: "not a row" }],
      home: { lat: 1, lng: 2 },
      related: { collection: "articles", id: "x1" },
    };
    expect(validateStored(description, data)).toBe(true);
    expect(assignIds(description, data, fresh)).toEqual({
      title: "Hi",
      rows: [
        { id: "fresh", label: "a" },
        { id: "kept-row", label: "b" },
      ],
      maybeRows: [null, { id: "fresh", label: "c" }],
      tags: ["x", "y"],
      targets: [{ collection: "pages", id: "p1" }],
      others: null,
      seo: { links: [{ id: "fresh", href: "/a" }] },
      plain: { id: "plain-id" },
      layout: [
        { type: "hero", id: "fresh", heading: "Hi" },
        { type: "hero", id: "kept-block", heading: "Again" },
        {
          type: "gallery",
          id: "fresh",
          images: [
            { id: "fresh", src: "a.png" },
            { id: "kept-image", src: "b.png" },
          ],
          inner: [{ type: "quote", id: "fresh", text: "q" }],
        },
      ],
      meta: [{ type: "hero", heading: "not a block" }, { label: "not a row" }],
      home: { lat: 1, lng: 2 },
      related: { collection: "articles", id: "x1" },
    });
  });

  test("does not change the input document", () => {
    const data: DocumentData = {
      title: "Hi",
      rows: [{ label: "a" }],
      maybeRows: [],
      tags: [],
      targets: [],
      others: [],
      seo: { links: [] },
      plain: { id: "p" },
      layout: [{ type: "hero", heading: "Hi" }],
      meta: null,
      home: { lat: 0, lng: 0 },
      related: { collection: "pages", id: "p1" },
    };
    const copy = structuredClone(data);
    assignIds(description, data, fresh);
    expect(data).toEqual(copy);
  });
});

describe("projectDocument for older clients", () => {
  const id = "00000000-0000-4000-8000-000000000001";

  test("keeps null lists, scalar and reference list items, null rows and json arrays unchanged", () => {
    const shared = articlesDescription({
      tags: list(text()).nullable(),
      labels: list(text()),
      rows: list(object({ label: text() }).nullable()),
      meta: json(),
      targets: list(reference(["articles", "pages"])),
    });
    const document = {
      id,
      tags: null,
      labels: ["a", "b"],
      rows: [null, { id: "r1", label: "x" }],
      meta: [{ type: "hero", heading: "not a block" }, 1],
      targets: [{ collection: "pages", id: "p1" }],
    };
    expect(projectDocument(shared, shared, document)).toEqual({ ok: true, data: document });
  });

  test("leaves out blocks whose type the client lacks, even when it names an Object property", () => {
    const variant = (fields: Record<string, FieldDescription>) =>
      ({ type: "object", required: true, nullable: false, fields }) as const;
    const heading = { heading: plainText };
    const client: CollectionDescription = {
      fields: {
        layout: {
          type: "blocks",
          required: true,
          nullable: false,
          variants: { hero: variant(heading) },
        },
      },
    };
    const server: CollectionDescription = {
      fields: {
        layout: {
          type: "blocks",
          required: true,
          nullable: false,
          variants: {
            hero: variant(heading),
            constructor: variant({}),
            toString: variant({}),
          },
        },
      },
    };
    expect(
      projectDocument(client, server, {
        id,
        layout: [
          { type: "constructor", id: "b1" },
          { type: "hero", id: "b2", heading: "Hi" },
          { type: "toString", id: "b3" },
        ],
      }),
    ).toEqual({ ok: true, data: { id, layout: [{ type: "hero", id: "b2", heading: "Hi" }] } });
  });
});
