import {
  blocks,
  boolean,
  collection,
  date,
  datetime,
  json,
  list,
  number,
  object,
  point,
  reference,
  text,
  type CollectionDescription,
} from "@aircastle/schema";
import { describe, expect, test } from "vite-plus/test";
import {
  compileDescription,
  describeCollections,
  parseCollections,
  validateStored,
} from "./index.ts";

const authors: CollectionDescription = {
  fields: { name: { type: "text", required: true, nullable: false, unique: false } },
};
const pages: CollectionDescription = {
  fields: { title: { type: "text", required: true, nullable: false, unique: false } },
};
const articles: CollectionDescription = {
  fields: {
    rating: { type: "number", required: true, nullable: false, integer: true, min: 1, max: 5 },
    score: {
      type: "number",
      required: false,
      nullable: true,
      integer: false,
      min: -1.5,
      max: 99.5,
      default: null,
    },
    featured: { type: "boolean", required: false, nullable: false, default: false },
    pinned: { type: "boolean", required: false, nullable: false, editor: { type: "switch" } },
    publishedOn: {
      type: "date",
      required: true,
      nullable: false,
      min: "2000-01-01",
      max: "2099-12-31",
    },
    updatedAt: {
      type: "datetime",
      required: false,
      nullable: false,
      min: "2025-12-31T13:00:00.000Z",
    },
    tags: {
      type: "list",
      required: true,
      nullable: false,
      max: 10,
      item: { type: "text", required: true, nullable: false, unique: false, max: 30 },
    },
    scores: {
      type: "list",
      required: false,
      nullable: false,
      default: [1, null],
      item: { type: "number", required: true, nullable: true, integer: false },
    },
    seo: {
      type: "object",
      required: true,
      nullable: false,
      fields: {
        description: { type: "text", required: false, nullable: false, unique: false },
        slug: { type: "text", required: false, nullable: false, unique: false, default: "" },
      },
    },
    rows: {
      type: "list",
      required: true,
      nullable: false,
      item: {
        type: "object",
        required: true,
        nullable: false,
        fields: {
          label: { type: "text", required: true, nullable: false, unique: false },
          who: { type: "reference", required: true, nullable: false, collection: "authors" },
        },
      },
    },
    writers: {
      type: "list",
      required: true,
      nullable: false,
      item: { type: "reference", required: true, nullable: false, collection: "authors" },
    },
    layout: {
      type: "blocks",
      required: true,
      nullable: false,
      min: 1,
      variants: {
        hero: {
          type: "object",
          required: true,
          nullable: false,
          fields: { heading: { type: "text", required: true, nullable: false, unique: false } },
        },
        quote: {
          type: "object",
          required: true,
          nullable: false,
          fields: {
            text: { type: "text", required: true, nullable: false, unique: false },
            by: { type: "text", required: false, nullable: false, unique: false },
          },
        },
        link: {
          type: "object",
          required: true,
          nullable: false,
          fields: {
            target: {
              type: "reference",
              required: true,
              nullable: false,
              collections: ["articles", "pages"],
            },
          },
        },
      },
    },
    meta: { type: "json", required: false, nullable: false, default: { b: 1, a: [true, null] } },
    location: { type: "point", required: true, nullable: true },
    home: {
      type: "point",
      required: false,
      nullable: false,
      default: { lat: -33.86, lng: 151.21 },
    },
    author: { type: "reference", required: true, nullable: false, collection: "authors" },
    related: {
      type: "reference",
      required: false,
      nullable: false,
      collections: ["articles", "pages"],
    },
  },
};
const published = [
  { name: "authors", description: authors },
  { name: "pages", description: pages },
  { name: "articles", description: articles },
];

const invalidRequest = { ok: false, error: { code: "invalid_request" } };

function withArticleField(name: string, definition: unknown) {
  return [
    { name: "authors", description: authors },
    { name: "articles", description: { fields: { [name]: definition } } },
  ];
}

describe("every field kind round-trips through the wire", () => {
  test("builders describe every kind with the published wire shape", () => {
    expect(
      describeCollections({
        authors: collection({ name: text() }),
        pages: collection({ title: text() }),
        articles: collection({
          rating: number().int().min(1).max(5),
          score: number().min(-1.5).max(99.5).nullable().default(null),
          featured: boolean().default(false),
          pinned: boolean().editor("switch").optional(),
          publishedOn: date().min("2000-01-01").max("2099-12-31"),
          updatedAt: datetime().min("2026-01-01T00:00+11:00").optional(),
          tags: list(text().max(30)).max(10),
          scores: list(number().nullable()).default([1, null]),
          seo: object({ description: text().optional(), slug: text().default("") }),
          rows: list(object({ label: text(), who: reference("authors") })),
          writers: list(reference("authors")),
          layout: blocks({
            hero: object({ heading: text() }),
            quote: object({ text: text(), by: text().optional() }),
            link: object({ target: reference(["articles", "pages"]) }),
          }).min(1),
          meta: json().default({ b: 1, a: [true, null] }),
          location: point().nullable(),
          home: point().default({ lat: -33.86, lng: 151.21 }),
          author: reference("authors"),
          related: reference(["articles", "pages"]).optional(),
        }),
      }),
    ).toEqual(published);
  });

  test("parsing the serialized publication returns it unchanged", () => {
    const serialized = JSON.parse(JSON.stringify(published));
    expect(parseCollections(serialized)).toEqual({ ok: true, data: published });
  });

  test("a parsed description compiles and describes itself unchanged", () => {
    expect(compileDescription(articles).describe()).toEqual(articles);
  });

  test("a nested field named id is allowed in a plain object", () => {
    const input = withArticleField("seo", {
      type: "object",
      required: true,
      nullable: false,
      fields: { id: { type: "text", required: true, nullable: false, unique: false } },
    });
    expect(parseCollections(input)).toEqual({ ok: true, data: input });
  });

  test("a boolean with the checkbox editor is described without an editor", () => {
    expect(
      describeCollections({ articles: collection({ featured: boolean().editor("checkbox") }) }),
    ).toEqual([
      {
        name: "articles",
        description: { fields: { featured: { type: "boolean", required: true, nullable: false } } },
      },
    ]);
  });
});

describe("reference targets", () => {
  const author = { type: "reference", required: true, nullable: false, collection: "authors" };

  test("a reference may name a collection published later in the set", () => {
    const input = [
      { name: "articles", description: { fields: { author } } },
      { name: "authors", description: authors },
    ];
    expect(parseCollections(input)).toEqual({ ok: true, data: input });
  });

  test("a collection may reference itself", () => {
    const input = [
      {
        name: "pages",
        description: {
          fields: {
            parent: { type: "reference", required: false, nullable: true, collection: "pages" },
          },
        },
      },
    ];
    expect(parseCollections(input)).toEqual({ ok: true, data: input });
  });

  test.each([
    ["single reference", { ...author, collection: "users" }],
    [
      "multi-reference with one unpublished name",
      { type: "reference", required: true, nullable: false, collections: ["authors", "users"] },
    ],
    [
      "reference nested in a list of objects",
      {
        type: "list",
        required: true,
        nullable: false,
        item: {
          type: "object",
          required: true,
          nullable: false,
          fields: { who: { ...author, collection: "users" } },
        },
      },
    ],
    [
      "reference inside a block variant",
      {
        type: "blocks",
        required: true,
        nullable: false,
        variants: {
          byline: {
            type: "object",
            required: true,
            nullable: false,
            fields: { who: { ...author, collection: "users" } },
          },
        },
      },
    ],
  ])("parseCollections rejects a %s whose target is not published", (_name, definition) => {
    expect(parseCollections(withArticleField("author", definition))).toEqual(invalidRequest);
  });

  test("a stored contract decoded alone checks only its own shape", () => {
    const stored: CollectionDescription = {
      fields: {
        author: { type: "reference", required: true, nullable: false, collection: "users" },
        related: {
          type: "reference",
          required: false,
          nullable: false,
          collections: ["posts", "pages"],
        },
      },
    };
    expect(compileDescription(stored).describe()).toEqual(stored);
    expect(
      validateStored(stored, { author: "u_1", related: { collection: "posts", id: "p_1" } }),
    ).toBe(true);
  });
});

const baselines: Record<string, Record<string, unknown>> = {
  number: { type: "number", required: true, nullable: false, integer: false },
  boolean: { type: "boolean", required: true, nullable: false },
  date: { type: "date", required: true, nullable: false },
  datetime: { type: "datetime", required: true, nullable: false },
  list: {
    type: "list",
    required: true,
    nullable: false,
    item: { type: "text", required: true, nullable: false, unique: false },
  },
  object: { type: "object", required: true, nullable: false, fields: {} },
  blocks: {
    type: "blocks",
    required: true,
    nullable: false,
    variants: { hero: { type: "object", required: true, nullable: false, fields: {} } },
  },
  json: { type: "json", required: true, nullable: false },
  point: { type: "point", required: true, nullable: false },
  reference: { type: "reference", required: true, nullable: false, collection: "authors" },
  multiReference: {
    type: "reference",
    required: true,
    nullable: false,
    collections: ["authors"],
  },
};
const kindsWithoutEditors = Object.keys(baselines).filter((kind) => kind !== "boolean");

describe("malformed field descriptions", () => {
  test.each(Object.entries(baselines))("the %s baseline is accepted", (_kind, definition) => {
    const input = withArticleField("value", definition);
    expect(parseCollections(input)).toEqual({ ok: true, data: input });
  });

  test.each(kindsWithoutEditors)("%s rejects an editor", (kind) => {
    expect(
      parseCollections(
        withArticleField("value", { ...baselines[kind], editor: { type: "switch" } }),
      ),
    ).toEqual(invalidRequest);
  });

  test.each([{ type: "textarea", rows: 3 }, { type: "radio" }, { type: "slider" }, {}, "switch"])(
    "boolean rejects the editor %j",
    (editor) => {
      expect(parseCollections(withArticleField("value", { ...baselines.boolean, editor }))).toEqual(
        invalidRequest,
      );
    },
  );

  test("text rejects the switch editor", () => {
    expect(
      parseCollections(
        withArticleField("value", {
          type: "text",
          required: true,
          nullable: false,
          unique: false,
          editor: { type: "switch" },
        }),
      ),
    ).toEqual(invalidRequest);
  });

  test.each(
    Object.keys(baselines).flatMap(
      (kind) =>
        [
          [kind, false],
          [kind, true],
        ] as const,
    ),
  )("%s rejects unique set to %s", (kind, unique) => {
    expect(parseCollections(withArticleField("value", { ...baselines[kind], unique }))).toEqual(
      invalidRequest,
    );
  });

  test.each([
    [
      "single reference with a null default",
      { ...baselines.reference, required: false, nullable: true, default: null },
    ],
    [
      "single reference with an id default",
      { ...baselines.reference, required: false, default: "a_1" },
    ],
    [
      "multi-reference with a default",
      {
        ...baselines.multiReference,
        required: false,
        default: { collection: "authors", id: "a_1" },
      },
    ],
  ])("rejects a %s", (_name, definition) => {
    expect(parseCollections(withArticleField("value", definition))).toEqual(invalidRequest);
  });

  test.each([
    [
      "optional list item",
      {
        ...baselines.list,
        item: { type: "text", required: false, nullable: false, unique: false },
      },
    ],
    [
      "optional block variant",
      {
        ...baselines.blocks,
        variants: { hero: { type: "object", required: false, nullable: false, fields: {} } },
      },
    ],
    [
      "nullable block variant",
      {
        ...baselines.blocks,
        variants: { hero: { type: "object", required: true, nullable: true, fields: {} } },
      },
    ],
    [
      "defaulted list item",
      {
        ...baselines.list,
        item: { type: "text", required: true, nullable: false, unique: false, default: "x" },
      },
    ],
    [
      "unique list item",
      { ...baselines.list, item: { type: "text", required: true, nullable: false, unique: true } },
    ],
    [
      "unique text inside an object",
      {
        ...baselines.object,
        fields: { slug: { type: "text", required: true, nullable: false, unique: true } },
      },
    ],
    [
      "nested text without its unique flag",
      { ...baselines.object, fields: { slug: { type: "text", required: true, nullable: false } } },
    ],
  ])("rejects an %s", (_name, definition) => {
    expect(parseCollections(withArticleField("value", definition))).toEqual(invalidRequest);
  });

  test.each(["bad-name", "1st", "", "has space"])("rejects the nested field name %j", (name) => {
    expect(
      parseCollections(
        withArticleField("value", {
          ...baselines.object,
          fields: { [name]: { type: "text", required: true, nullable: false, unique: false } },
        }),
      ),
    ).toEqual(invalidRequest);
  });

  test.each(["bad-name", "1st", "", "has space"])("rejects the variant name %j", (name) => {
    expect(
      parseCollections(
        withArticleField("value", {
          ...baselines.blocks,
          variants: { [name]: { type: "object", required: true, nullable: false, fields: {} } },
        }),
      ),
    ).toEqual(invalidRequest);
  });

  test.each([
    [
      "list row",
      {
        ...baselines.list,
        item: {
          type: "object",
          required: true,
          nullable: false,
          fields: { id: { type: "text", required: true, nullable: false, unique: false } },
        },
      },
    ],
    [
      "block variant",
      {
        ...baselines.blocks,
        variants: {
          hero: {
            type: "object",
            required: true,
            nullable: false,
            fields: { id: { type: "text", required: true, nullable: false, unique: false } },
          },
        },
      },
    ],
  ])("rejects a field named id in a %s", (_name, definition) => {
    expect(parseCollections(withArticleField("value", definition))).toEqual(invalidRequest);
  });

  test.each([
    [
      "list item number with an editor",
      { ...baselines.list, item: { ...baselines.number, editor: { type: "switch" } } },
    ],
    [
      "object-field reference with a default",
      {
        ...baselines.object,
        fields: { who: { ...baselines.reference, required: false, nullable: true, default: null } },
      },
    ],
    [
      "variant-field json with unique",
      {
        ...baselines.blocks,
        variants: {
          hero: {
            type: "object",
            required: true,
            nullable: false,
            fields: { data: { ...baselines.json, unique: false } },
          },
        },
      },
    ],
  ])("rejects a nested %s", (_name, definition) => {
    expect(parseCollections(withArticleField("value", definition))).toEqual(invalidRequest);
  });

  test("rejects a variant field named type", () => {
    expect(
      parseCollections(
        withArticleField("value", {
          ...baselines.blocks,
          variants: {
            hero: {
              type: "object",
              required: true,
              nullable: false,
              fields: { type: { type: "text", required: true, nullable: false, unique: false } },
            },
          },
        }),
      ),
    ).toEqual(invalidRequest);
  });

  test.each([
    ["number without integer", { type: "number", required: true, nullable: false }],
    ["number with a string integer flag", { ...baselines.number, integer: "true" }],
    ["number with a string bound", { ...baselines.number, min: "1" }],
    ["integer number with a fractional bound", { ...baselines.number, integer: true, min: 1.5 }],
    ["number with conflicting bounds", { ...baselines.number, min: 5, max: 1 }],
    ["number with choices", { ...baselines.number, choices: ["1"] }],
    ["number with a format", { ...baselines.number, format: "email" }],
    ["number with a string default", { ...baselines.number, required: false, default: "5" }],
    ["required number with a default", { ...baselines.number, default: 5 }],
    ["boolean with bounds", { ...baselines.boolean, min: 0 }],
    ["boolean with a numeric default", { ...baselines.boolean, required: false, default: 0 }],
    ["boolean without nullable", { type: "boolean", required: true }],
    ["date with an impossible bound", { ...baselines.date, min: "2026-02-30" }],
    ["date with a datetime bound", { ...baselines.date, max: "2026-02-14T09:00Z" }],
    ["date with a numeric bound", { ...baselines.date, max: 20260214 }],
    ["date with an invalid default", { ...baselines.date, required: false, default: "2023-02-29" }],
    ["datetime without an offset bound", { ...baselines.datetime, min: "2026-02-14T09:00" }],
    ["unknown kind", { type: "decimal", required: true, nullable: false }],
    ["list without an item", { type: "list", required: true, nullable: false }],
    ["list with a non-object item", { ...baselines.list, item: "text" }],
    ["list with a negative count", { ...baselines.list, min: -1 }],
    ["list with a fractional count", { ...baselines.list, max: 1.5 }],
    ["list with an invalid item default", { ...baselines.list, required: false, default: [1] }],
    ["object without fields", { type: "object", required: true, nullable: false }],
    ["object with an array of fields", { ...baselines.object, fields: [] }],
    [
      "object with a malformed nested field",
      { ...baselines.object, fields: { a: { type: "text" } } },
    ],
    ["object with bounds", { ...baselines.object, min: 1 }],
    ["blocks without variants", { type: "blocks", required: true, nullable: false }],
    ["blocks with no variants", { ...baselines.blocks, variants: {} }],
    [
      "blocks with a non-object variant",
      {
        ...baselines.blocks,
        variants: { hero: { type: "text", required: true, nullable: false, unique: false } },
      },
    ],
    ["json with bounds", { ...baselines.json, max: 1 }],
    [
      "point with a malformed default",
      { ...baselines.point, required: false, default: { lat: 1 } },
    ],
    [
      "point with an out-of-range default",
      { ...baselines.point, required: false, default: { lat: 91, lng: 0 } },
    ],
    ["reference without a target", { type: "reference", required: true, nullable: false }],
    ["reference with both target forms", { ...baselines.reference, collections: ["authors"] }],
    ["reference with a numeric target", { ...baselines.reference, collection: 1 }],
    ["multi-reference with no collections", { ...baselines.multiReference, collections: [] }],
    [
      "multi-reference with a duplicate collection",
      { ...baselines.multiReference, collections: ["authors", "authors"] },
    ],
    [
      "multi-reference with a string target",
      { ...baselines.multiReference, collections: "authors" },
    ],
    ["reference with bounds", { ...baselines.reference, min: 1 }],
  ])("rejects a %s", (_name, definition) => {
    expect(parseCollections(withArticleField("value", definition))).toEqual(invalidRequest);
  });
});
