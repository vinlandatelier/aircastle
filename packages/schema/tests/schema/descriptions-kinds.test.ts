import { describe, expect, test } from "vite-plus/test";
import {
  blocks,
  boolean,
  collection,
  compileSchema,
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
} from "../../src/index.ts";
import { expectSchemaError } from "../support/assertions.ts";
import type { FieldDeclaration } from "../support/collections.ts";

function compileFields(fields: Readonly<Record<string, FieldDeclaration>>) {
  return compileSchema({
    articles: collection(fields),
    authors: collection({}),
    posts: collection({}),
    pages: collection({}),
  }).articles;
}

function describeFields(fields: Readonly<Record<string, FieldDeclaration>>): CollectionDescription {
  let compiled: ReturnType<typeof compileFields> | undefined;
  expect(() => {
    compiled = compileFields(fields);
  }, "valid declarations compile").not.toThrow();
  return compiled!.describe();
}

function expectSameOwnKeys(actual: unknown, expected: unknown, path: string): void {
  if (expected === null || typeof expected !== "object") return;
  expect(actual, path).not.toBeNull();
  expect(typeof actual, path).toBe("object");
  expect(Array.isArray(actual), path).toBe(Array.isArray(expected));
  const actualKeys = Reflect.ownKeys(actual as object).filter((key) => key !== "length");
  const expectedKeys = Reflect.ownKeys(expected).filter((key) => key !== "length");
  expect(new Set(actualKeys), path).toEqual(new Set(expectedKeys));
  for (const key of expectedKeys) {
    expectSameOwnKeys(
      Reflect.get(actual as object, key),
      Reflect.get(expected, key),
      `${path}.${String(key)}`,
    );
  }
}

function expectDescription(
  fields: Readonly<Record<string, FieldDeclaration>>,
  expected: CollectionDescription,
): void {
  const actual = describeFields(fields);
  expect(actual).toEqual(expected);
  expectSameOwnKeys(actual, expected, "description");
}

const required = { required: true, nullable: false } as const;
const plainText = { type: "text", ...required, unique: false } as const;

describe("FT-DESCRIBE numbers", () => {
  test("a plain number always describes integer false", () => {
    expectDescription(
      { rating: number() },
      { fields: { rating: { type: "number", ...required, integer: false } } },
    );
  });

  test("int, bounds, presence and default are all described", () => {
    expectDescription(
      { rating: number().int().min(1).max(5).optional().nullable().default(3) },
      {
        fields: {
          rating: {
            type: "number",
            required: false,
            nullable: true,
            integer: true,
            min: 1,
            max: 5,
            default: 3,
          },
        },
      },
    );
  });

  test("fractional bounds and a zero default are kept", () => {
    expectDescription(
      { price: number().min(-0.5).max(9.5).default(0) },
      {
        fields: {
          price: {
            type: "number",
            required: false,
            nullable: false,
            integer: false,
            min: -0.5,
            max: 9.5,
            default: 0,
          },
        },
      },
    );
  });

  test("a negative zero default is described as zero", () => {
    const description = describeFields({ offset: number().default(-0) });
    expect(description).toEqual({
      fields: {
        offset: { type: "number", required: false, nullable: false, integer: false, default: 0 },
      },
    });
    const field = description.fields.offset as { default?: unknown };
    expect(Object.is(field.default, 0)).toBe(true);
  });

  test("a nullable number with a null default", () => {
    expectDescription(
      { rating: number().nullable().default(null) },
      {
        fields: {
          rating: {
            type: "number",
            required: false,
            nullable: true,
            integer: false,
            default: null,
          },
        },
      },
    );
  });
});

describe("FT-BOOLEAN-2 boolean editors", () => {
  const plainBoolean = { type: "boolean", ...required } as const;

  test("a plain boolean has no editor or default", () => {
    expectDescription({ featured: boolean() }, { fields: { featured: plainBoolean } });
  });

  test("a false default is described", () => {
    expectDescription(
      { featured: boolean().default(false) },
      {
        fields: { featured: { type: "boolean", required: false, nullable: false, default: false } },
      },
    );
  });

  test("optional nullable boolean with a null default", () => {
    expectDescription(
      { featured: boolean().optional().nullable().default(null) },
      { fields: { featured: { type: "boolean", required: false, nullable: true, default: null } } },
    );
  });

  test("the switch editor is described as { type: switch }", () => {
    expectDescription(
      { featured: boolean().editor("switch") },
      { fields: { featured: { ...plainBoolean, editor: { type: "switch" } } } },
    );
  });

  test("an explicit checkbox describes identically to a plain boolean", () => {
    const explicit = describeFields({ featured: boolean().editor("checkbox") });
    expect(explicit).toEqual(describeFields({ featured: boolean() }));
    expectDescription(
      { featured: boolean().editor("checkbox") },
      { fields: { featured: plainBoolean } },
    );
  });

  test("an editor name booleans do not support is unknown_editor", () => {
    for (const editor of ["slider", "textarea"]) {
      expectSchemaError(
        () => compileFields({ featured: boolean().editor(editor as "switch") }),
        [{ code: "unknown_editor", path: ["articles", "featured"], editor }],
      );
    }
  });

  test("checkbox then switch conflicts", () => {
    expectSchemaError(
      () => compileFields({ featured: boolean().editor("checkbox").editor("switch") }),
      [{ code: "conflicting_editors", path: ["articles", "featured"] }],
    );
  });

  test("a nested switch editor is described at depth", () => {
    expectDescription(
      { settings: object({ visible: boolean().editor("switch") }) },
      {
        fields: {
          settings: {
            type: "object",
            ...required,
            fields: { visible: { ...plainBoolean, editor: { type: "switch" } } },
          },
        },
      },
    );
  });
});

describe("FT-DESCRIBE dates and datetimes", () => {
  test("plain date and datetime", () => {
    expectDescription(
      { publishedOn: date(), updatedAt: datetime() },
      {
        fields: {
          publishedOn: { type: "date", ...required },
          updatedAt: { type: "datetime", ...required },
        },
      },
    );
  });

  test("date bounds and default are described", () => {
    expectDescription(
      { publishedOn: date().min("2026-01-01").max("2026-12-31").default("2026-02-14") },
      {
        fields: {
          publishedOn: {
            type: "date",
            required: false,
            nullable: false,
            min: "2026-01-01",
            max: "2026-12-31",
            default: "2026-02-14",
          },
        },
      },
    );
  });

  test("datetime bounds and default are described as normalized UTC instants", () => {
    expectDescription(
      {
        updatedAt: datetime()
          .min("2026-01-01T00:00Z")
          .max("2026-12-31T23:59:59+11:00")
          .default("2026-02-14T09:00+11:00"),
      },
      {
        fields: {
          updatedAt: {
            type: "datetime",
            required: false,
            nullable: false,
            min: "2026-01-01T00:00:00.000Z",
            max: "2026-12-31T12:59:59.000Z",
            default: "2026-02-13T22:00:00.000Z",
          },
        },
      },
    );
  });

  test("optional nullable datetime with a null default", () => {
    expectDescription(
      { updatedAt: datetime().optional().nullable().default(null) },
      {
        fields: { updatedAt: { type: "datetime", required: false, nullable: true, default: null } },
      },
    );
  });
});

describe("FT-DESCRIBE and FT-DESCSHAPE lists", () => {
  test("a list item is a full required description and nested text keeps unique false", () => {
    expectDescription(
      { tags: list(text().max(30)) },
      { fields: { tags: { type: "list", ...required, item: { ...plainText, max: 30 } } } },
    );
  });

  test("count bounds and presence are described", () => {
    expectDescription(
      { scores: list(number().int()).min(1).max(10).optional().nullable() },
      {
        fields: {
          scores: {
            type: "list",
            required: false,
            nullable: true,
            min: 1,
            max: 10,
            item: { type: "number", ...required, integer: true },
          },
        },
      },
    );
  });

  test("a nullable item stays required", () => {
    expectDescription(
      { notes: list(text().nullable()) },
      {
        fields: {
          notes: {
            type: "list",
            ...required,
            item: { type: "text", required: true, nullable: true, unique: false },
          },
        },
      },
    );
  });

  test("an empty list default is described", () => {
    expectDescription(
      { tags: list(text()).default([]) },
      {
        fields: {
          tags: { type: "list", required: false, nullable: false, item: plainText, default: [] },
        },
      },
    );
  });

  test("a list default of datetimes is described as validated output", () => {
    expectDescription(
      { times: list(datetime()).default(["2026-02-14T09:00+11:00", "2026-02-14T09:00:05.1Z"]) },
      {
        fields: {
          times: {
            type: "list",
            required: false,
            nullable: false,
            item: { type: "datetime", ...required },
            default: ["2026-02-13T22:00:00.000Z", "2026-02-14T09:00:05.100Z"],
          },
        },
      },
    );
  });

  test("object rows never describe their implicit id", () => {
    expectDescription(
      { rows: list(object({ label: text() })) },
      {
        fields: {
          rows: {
            type: "list",
            ...required,
            item: { type: "object", ...required, fields: { label: plainText } },
          },
        },
      },
    );
  });

  test("a row default is described as validated output with nested defaults applied", () => {
    expectDescription(
      {
        rows: list(object({ label: text(), weight: number().default(1) })).default([
          { label: "a" },
        ]),
      },
      {
        fields: {
          rows: {
            type: "list",
            required: false,
            nullable: false,
            item: {
              type: "object",
              ...required,
              fields: {
                label: plainText,
                weight: {
                  type: "number",
                  required: false,
                  nullable: false,
                  integer: false,
                  default: 1,
                },
              },
            },
            default: [{ label: "a", weight: 1 }],
          },
        },
      },
    );
  });

  test("lists nest lists", () => {
    expectDescription(
      { grid: list(list(number())) },
      {
        fields: {
          grid: {
            type: "list",
            ...required,
            item: {
              type: "list",
              ...required,
              item: { type: "number", ...required, integer: false },
            },
          },
        },
      },
    );
  });
});

describe("FT-DESCRIBE objects", () => {
  test("an empty object", () => {
    expectDescription(
      { seo: object({}) },
      { fields: { seo: { type: "object", ...required, fields: {} } } },
    );
  });

  test("nested fields keep their own presence, defaults and unique false", () => {
    expectDescription(
      {
        seo: object({
          description: text().optional(),
          slug: text().default("home"),
          image: object({ alt: text().nullable() }).optional(),
        }),
      },
      {
        fields: {
          seo: {
            type: "object",
            ...required,
            fields: {
              description: { type: "text", required: false, nullable: false, unique: false },
              slug: {
                type: "text",
                required: false,
                nullable: false,
                unique: false,
                default: "home",
              },
              image: {
                type: "object",
                required: false,
                nullable: false,
                fields: { alt: { type: "text", required: true, nullable: true, unique: false } },
              },
            },
          },
        },
      },
    );
  });

  test("a field named id is allowed in a plain object and is described", () => {
    expectDescription(
      { external: object({ id: text() }) },
      { fields: { external: { type: "object", ...required, fields: { id: plainText } } } },
    );
  });

  test("an object default is described as validated output", () => {
    expectDescription(
      {
        seo: object({ a: text(), b: text().default("y"), at: datetime().optional() })
          .optional()
          .default({ a: "x", at: "2026-02-14T09:00+11:00" }),
      },
      {
        fields: {
          seo: {
            type: "object",
            required: false,
            nullable: false,
            fields: {
              a: plainText,
              b: { type: "text", required: false, nullable: false, unique: false, default: "y" },
              at: { type: "datetime", required: false, nullable: false },
            },
            default: { a: "x", b: "y", at: "2026-02-13T22:00:00.000Z" },
          },
        },
      },
    );
  });

  test("a nullable object with a null default", () => {
    expectDescription(
      { seo: object({}).nullable().default(null) },
      {
        fields: {
          seo: { type: "object", required: false, nullable: true, fields: {}, default: null },
        },
      },
    );
  });
});

describe("FT-DESCRIBE references", () => {
  test("a single reference describes its collection", () => {
    expectDescription(
      { author: reference("authors") },
      { fields: { author: { type: "reference", ...required, collection: "authors" } } },
    );
  });

  test("a self-reference describes its own collection", () => {
    expectDescription(
      { parent: reference("articles").optional().nullable() },
      {
        fields: {
          parent: { type: "reference", required: false, nullable: true, collection: "articles" },
        },
      },
    );
  });

  test("a multi-reference describes its collections in declaration order", () => {
    expectDescription(
      { related: reference(["posts", "pages"]) },
      { fields: { related: { type: "reference", ...required, collections: ["posts", "pages"] } } },
    );
  });

  test("a one-element multi-reference still describes collections", () => {
    expectDescription(
      { related: reference(["posts"]).optional() },
      {
        fields: {
          related: { type: "reference", required: false, nullable: false, collections: ["posts"] },
        },
      },
    );
  });

  test("references inside lists and objects", () => {
    expectDescription(
      { coauthors: list(reference("authors")), meta: object({ page: reference(["pages"]) }) },
      {
        fields: {
          coauthors: {
            type: "list",
            ...required,
            item: { type: "reference", ...required, collection: "authors" },
          },
          meta: {
            type: "object",
            ...required,
            fields: { page: { type: "reference", ...required, collections: ["pages"] } },
          },
        },
      },
    );
  });
});

describe("FT-DESCRIBE and FT-DESCSHAPE blocks", () => {
  const hero = { type: "object", ...required, fields: { heading: plainText } } as const;
  const quote = {
    type: "object",
    ...required,
    fields: {
      text: plainText,
      by: { type: "text", required: false, nullable: false, unique: false },
    },
  } as const;

  test("variants are full required, non-nullable object descriptions without type or id", () => {
    expectDescription(
      {
        layout: blocks({
          hero: object({ heading: text() }),
          quote: object({ text: text(), by: text().optional() }),
        }),
      },
      { fields: { layout: { type: "blocks", ...required, variants: { hero, quote } } } },
    );
  });

  test("count bounds and presence are described", () => {
    expectDescription(
      {
        layout: blocks({ hero: object({ heading: text() }) })
          .min(1)
          .max(3)
          .optional()
          .nullable(),
      },
      {
        fields: {
          layout: {
            type: "blocks",
            required: false,
            nullable: true,
            min: 1,
            max: 3,
            variants: { hero },
          },
        },
      },
    );
  });

  test("an empty variant is described with no fields", () => {
    expectDescription(
      { layout: blocks({ divider: object({}) }) },
      {
        fields: {
          layout: {
            type: "blocks",
            ...required,
            variants: { divider: { type: "object", ...required, fields: {} } },
          },
        },
      },
    );
  });

  test("a blocks default is described as validated output without ids", () => {
    expectDescription(
      {
        layout: blocks({
          quote: object({ text: text(), by: text().default("anonymous") }),
        }).default([{ type: "quote", text: "Hi" }]),
      },
      {
        fields: {
          layout: {
            type: "blocks",
            required: false,
            nullable: false,
            variants: {
              quote: {
                type: "object",
                ...required,
                fields: {
                  text: plainText,
                  by: {
                    type: "text",
                    required: false,
                    nullable: false,
                    unique: false,
                    default: "anonymous",
                  },
                },
              },
            },
            default: [{ type: "quote", text: "Hi", by: "anonymous" }],
          },
        },
      },
    );
  });

  test("blocks nested inside objects inside list rows", () => {
    expectDescription(
      { sections: list(object({ body: blocks({ hero: object({ heading: text() }) }) })) },
      {
        fields: {
          sections: {
            type: "list",
            ...required,
            item: {
              type: "object",
              ...required,
              fields: { body: { type: "blocks", ...required, variants: { hero } } },
            },
          },
        },
      },
    );
  });
});

describe("FT-DESCRIBE json and points", () => {
  test("plain json and point", () => {
    expectDescription(
      { data: json(), location: point() },
      {
        fields: {
          data: { type: "json", ...required },
          location: { type: "point", ...required },
        },
      },
    );
  });

  test("a json default is described as validated output with negative zero as zero", () => {
    const description = describeFields({
      data: json().default({ a: [1, "x", true, null, { b: -0 }] }),
    });
    expect(description).toEqual({
      fields: {
        data: {
          type: "json",
          required: false,
          nullable: false,
          default: { a: [1, "x", true, null, { b: 0 }] },
        },
      },
    });
    const field = description.fields.data as unknown as {
      default: { a: [0, 0, 0, 0, { b: number }] };
    };
    expect(Object.is(field.default.a[4].b, 0)).toBe(true);
  });

  test("a json scalar default and a nullable null default", () => {
    expectDescription(
      { flag: json().default(false), data: json().optional().nullable().default(null) },
      {
        fields: {
          flag: { type: "json", required: false, nullable: false, default: false },
          data: { type: "json", required: false, nullable: true, default: null },
        },
      },
    );
  });

  test("a point default and presence", () => {
    expectDescription(
      {
        home: point().default({ lat: -33.86, lng: 151.21 }),
        away: point().optional().nullable(),
      },
      {
        fields: {
          home: {
            type: "point",
            required: false,
            nullable: false,
            default: { lat: -33.86, lng: 151.21 },
          },
          away: { type: "point", required: false, nullable: true },
        },
      },
    );
  });
});

describe("FT-DESCRIBE ownership", () => {
  const fields = {
    rating: number().int().min(1).max(5).default(3),
    featured: boolean().editor("switch"),
    updatedAt: datetime().min("2026-01-01T00:00Z").default("2026-02-14T09:00+11:00"),
    tags: list(text().max(30)).default(["news"]),
    seo: object({ description: text().optional() }).default({ description: "d" }),
    related: reference(["posts", "pages"]),
    layout: blocks({ hero: object({ heading: text() }) }).default([
      { type: "hero", heading: "Hi" },
    ]),
    data: json().default({ a: [1] }),
    location: point().default({ lat: 1, lng: 2 }),
  };

  const expected = {
    fields: {
      rating: {
        type: "number",
        required: false,
        nullable: false,
        integer: true,
        min: 1,
        max: 5,
        default: 3,
      },
      featured: { type: "boolean", ...required, editor: { type: "switch" } },
      updatedAt: {
        type: "datetime",
        required: false,
        nullable: false,
        min: "2026-01-01T00:00:00.000Z",
        default: "2026-02-13T22:00:00.000Z",
      },
      tags: {
        type: "list",
        required: false,
        nullable: false,
        item: { ...plainText, max: 30 },
        default: ["news"],
      },
      seo: {
        type: "object",
        required: false,
        nullable: false,
        fields: { description: { type: "text", required: false, nullable: false, unique: false } },
        default: { description: "d" },
      },
      related: { type: "reference", ...required, collections: ["posts", "pages"] },
      layout: {
        type: "blocks",
        required: false,
        nullable: false,
        variants: { hero: { type: "object", ...required, fields: { heading: plainText } } },
        default: [{ type: "hero", heading: "Hi" }],
      },
      data: { type: "json", required: false, nullable: false, default: { a: [1] } },
      location: { type: "point", required: false, nullable: false, default: { lat: 1, lng: 2 } },
    },
  } as const;

  test("descriptions of every kind are plain serializable data", () => {
    const description = describeFields(fields);
    expect(description).toEqual(expected);
    expectSameOwnKeys(description, expected, "description");
    expect(JSON.parse(JSON.stringify(description))).toEqual(description);
    expectSameOwnKeys(JSON.parse(JSON.stringify(description)), expected, "roundTrip");
  });

  test("mutating a returned description cannot change later descriptions", () => {
    let compiled: ReturnType<typeof compileFields> | undefined;
    expect(() => {
      compiled = compileFields(fields);
    }, "valid declarations compile").not.toThrow();
    const first = compiled!.describe() as unknown as {
      fields: Record<string, Record<string, unknown>>;
    };
    const nested = (value: unknown, key: string): Record<string, unknown> =>
      Reflect.get(value as object, key) as Record<string, unknown>;
    const attempt = (action: () => unknown) => {
      try {
        action();
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
      }
    };
    attempt(() => Reflect.set(first.fields.rating!, "integer", false));
    attempt(() => Reflect.set(first.fields.rating!, "default", 99));
    attempt(() => Reflect.set(nested(first.fields.featured, "editor"), "type", "checkbox"));
    attempt(() => Reflect.set(first.fields.updatedAt!, "min", "1999-01-01T00:00:00.000Z"));
    attempt(() => Reflect.set(nested(first.fields.tags, "item"), "max", 1));
    attempt(() => Reflect.set(nested(first.fields.tags, "default"), "0", "changed"));
    attempt(() => Reflect.deleteProperty(nested(first.fields.seo, "fields"), "description"));
    attempt(() => Reflect.set(nested(first.fields.seo, "default"), "description", "changed"));
    attempt(() => Reflect.set(nested(first.fields.related, "collections"), "0", "users"));
    attempt(() => Reflect.deleteProperty(nested(first.fields.layout, "variants"), "hero"));
    attempt(() =>
      Reflect.set(nested(nested(first.fields.layout, "default"), "0"), "heading", "changed"),
    );
    attempt(() => Reflect.set(nested(nested(first.fields.data, "default"), "a"), "0", 2));
    attempt(() => Reflect.set(nested(first.fields.location, "default"), "lat", 50));
    attempt(() => Reflect.deleteProperty(first.fields, "rating"));
    const later = compiled!.describe();
    expect(later).toEqual(expected);
    expectSameOwnKeys(later, expected, "later");
  });
});
