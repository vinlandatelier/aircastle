import { describe, expect, test } from "vite-plus/test";
import {
  boolean,
  collection,
  compileSchema,
  date,
  datetime,
  json,
  number,
  point,
  text,
  type ExpectedType,
} from "../../src/index.ts";
import { compileCollection, type FieldDeclaration } from "../support/collections.ts";
import { compileValid } from "../support/compile-valid.ts";
import { expectFailure, expectSchemaError, expectSuccess } from "../support/assertions.ts";

interface ScalarBuilder {
  readonly optional: () => ScalarBuilder;
  readonly nullable: () => ScalarBuilder;
  readonly default: (value: unknown) => ScalarBuilder;
}

interface Kind {
  readonly name: string;
  readonly field: string;
  readonly base: () => ScalarBuilder;
  readonly expected: ExpectedType;
  readonly supplied: unknown;
  readonly falsy: unknown;
  readonly fallback: unknown;
  readonly wrong: unknown;
  readonly wrongIssue: Record<string, unknown>;
}

const scalar = (builder: unknown) => builder as ScalarBuilder;
const declared = (builder: ScalarBuilder) => builder as unknown as FieldDeclaration;

const kinds: readonly Kind[] = [
  {
    name: "number",
    field: "rating",
    base: () => scalar(number()),
    expected: "number",
    supplied: 4.5,
    falsy: 0,
    fallback: 7,
    wrong: "5",
    wrongIssue: { code: "invalid_type", expected: "number", received: "string" },
  },
  {
    name: "boolean",
    field: "featured",
    base: () => scalar(boolean()),
    expected: "boolean",
    supplied: true,
    falsy: false,
    fallback: true,
    wrong: "true",
    wrongIssue: { code: "invalid_type", expected: "boolean", received: "string" },
  },
  {
    name: "date",
    field: "publishedOn",
    base: () => scalar(date()),
    expected: "string",
    supplied: "2026-02-14",
    falsy: "0001-01-01",
    fallback: "2026-01-01",
    wrong: "2026-02-30",
    wrongIssue: { code: "invalid_date" },
  },
  {
    name: "datetime",
    field: "updatedAt",
    base: () => scalar(datetime()),
    expected: "string",
    supplied: "2026-02-14T09:00:00.000Z",
    falsy: "0001-01-01T00:00:00.000Z",
    fallback: "2026-01-01T00:00:00.000Z",
    wrong: "2026-02-14T09:00",
    wrongIssue: { code: "invalid_datetime" },
  },
  {
    name: "json",
    field: "data",
    base: () => scalar(json()),
    expected: "json",
    supplied: { a: [1, "x"] },
    falsy: false,
    fallback: { b: "y" },
    wrong: { a: NaN },
    wrongIssue: { code: "invalid_json", subpath: ["a"] },
  },
  {
    name: "point",
    field: "location",
    base: () => scalar(point()),
    expected: "object",
    supplied: { lat: 1.5, lng: -2.5 },
    falsy: { lat: 0, lng: 0 },
    fallback: { lat: -33.86, lng: 151.21 },
    wrong: { lat: 1 },
    wrongIssue: { code: "invalid_point" },
  },
];

function wrongIssueFor(kind: Kind) {
  const { subpath, ...details } = kind.wrongIssue as { subpath?: string[] };
  return { ...details, path: [kind.field, ...(subpath ?? [])] } as never;
}

type Answer =
  | { readonly kind: "required" }
  | { readonly kind: "omitted" }
  | { readonly kind: "wrong null" }
  | { readonly kind: "value"; readonly value: unknown };

const required: Answer = { kind: "required" };
const omitted: Answer = { kind: "omitted" };
const wrongNull: Answer = { kind: "wrong null" };
const value = (value: unknown): Answer => ({ kind: "value", value });

describe("presence, undefined, null and defaults for every scalar kind", () => {
  const rows: {
    name: string;
    build: (base: ScalarBuilder, fallback: unknown) => ScalarBuilder;
    answers: (kind: Kind) => Answer[];
  }[] = [
    {
      name: "required",
      build: (b) => b,
      answers: (k) => [required, required, wrongNull, value(k.falsy), value(k.supplied)],
    },
    {
      name: "optional",
      build: (b) => b.optional(),
      answers: (k) => [omitted, omitted, wrongNull, value(k.falsy), value(k.supplied)],
    },
    {
      name: "nullable",
      build: (b) => b.nullable(),
      answers: (k) => [required, required, value(null), value(k.falsy), value(k.supplied)],
    },
    {
      name: "optional nullable",
      build: (b) => b.optional().nullable(),
      answers: (k) => [omitted, omitted, value(null), value(k.falsy), value(k.supplied)],
    },
    {
      name: "default",
      build: (b, f) => b.default(f),
      answers: (k) => [
        value(k.fallback),
        value(k.fallback),
        wrongNull,
        value(k.falsy),
        value(k.supplied),
      ],
    },
    {
      name: "optional then default",
      build: (b, f) => b.optional().default(f),
      answers: (k) => [
        value(k.fallback),
        value(k.fallback),
        wrongNull,
        value(k.falsy),
        value(k.supplied),
      ],
    },
    {
      name: "default then optional",
      build: (b, f) => b.default(f).optional(),
      answers: (k) => [
        value(k.fallback),
        value(k.fallback),
        wrongNull,
        value(k.falsy),
        value(k.supplied),
      ],
    },
    {
      name: "nullable default",
      build: (b, f) => b.nullable().default(f),
      answers: (k) => [
        value(k.fallback),
        value(k.fallback),
        value(null),
        value(k.falsy),
        value(k.supplied),
      ],
    },
    {
      name: "null default",
      build: (b) => b.nullable().default(null),
      answers: (k) => [value(null), value(null), value(null), value(k.falsy), value(k.supplied)],
    },
    {
      name: "optional null default",
      build: (b) => b.nullable().default(null).optional(),
      answers: (k) => [value(null), value(null), value(null), value(k.falsy), value(k.supplied)],
    },
  ];

  for (const kind of kinds) {
    const inputs: { name: string; value: Record<string, unknown> }[] = [
      { name: "absent", value: {} },
      { name: "undefined", value: { [kind.field]: undefined } },
      { name: "null", value: { [kind.field]: null } },
      { name: "falsy-looking value", value: { [kind.field]: kind.falsy } },
      { name: "supplied value", value: { [kind.field]: kind.supplied } },
    ];
    for (const row of rows) {
      const answers = row.answers(kind);
      inputs.forEach((input, index) => {
        test(`${kind.name} ${row.name} with ${input.name}`, () => {
          const compiled = compileValid({
            [kind.field]: declared(row.build(kind.base(), kind.fallback)),
          });
          const before = Object.getOwnPropertyDescriptors(input.value);
          const result = compiled.validate(input.value);
          const answer = answers[index]!;
          if (answer.kind === "required")
            expectFailure(result, [{ code: "required", path: [kind.field] }]);
          else if (answer.kind === "wrong null")
            expectFailure(result, [
              {
                code: "invalid_type",
                path: [kind.field],
                expected: kind.expected,
                received: "null",
              },
            ]);
          else if (answer.kind === "omitted") expectSuccess(result, {});
          else expectSuccess(result, { [kind.field]: answer.value });
          expect(Object.getOwnPropertyDescriptors(input.value)).toEqual(before);
        });
      });
    }
  }

  for (const kind of kinds) {
    test(`${kind.name} supplied invalid data is not replaced by the default`, () => {
      const compiled = compileValid({
        [kind.field]: declared(kind.base().default(kind.fallback)),
      });
      expectFailure(compiled.validate({ [kind.field]: kind.wrong }), [wrongIssueFor(kind)]);
    });

    test(`${kind.name} allowed null skips every other rule`, () => {
      const compiled = compileValid({ [kind.field]: declared(kind.base().nullable()) });
      expectSuccess(compiled.validate({ [kind.field]: null }), { [kind.field]: null });
    });

    test(`${kind.name} builders are immutable and reusable`, () => {
      const base = kind.base();
      const optional = base.optional();
      const nullable = base.nullable();
      const defaulted = base.default(kind.fallback);
      expectFailure(compileValid({ [kind.field]: declared(base) }).validate({}), [
        { code: "required", path: [kind.field] },
      ]);
      expectFailure(
        compileValid({ [kind.field]: declared(base) }).validate({ [kind.field]: null }),
        [{ code: "invalid_type", path: [kind.field], expected: kind.expected, received: "null" }],
      );
      expectSuccess(compileValid({ [kind.field]: declared(optional) }).validate({}), {});
      expectSuccess(
        compileValid({ [kind.field]: declared(nullable) }).validate({ [kind.field]: null }),
        { [kind.field]: null },
      );
      expectSuccess(compileValid({ [kind.field]: declared(defaulted) }).validate({}), {
        [kind.field]: kind.fallback,
      });
    });

    test(`${kind.name} default(undefined) is invalid with an invalid_type cause`, () => {
      const path = ["articles", kind.field];
      expectSchemaError(
        () => compileCollection({ [kind.field]: declared(kind.base().default(undefined)) }),
        [
          {
            code: "invalid_default",
            path,
            causes: [
              { code: "invalid_type", path, expected: kind.expected, received: "undefined" },
            ],
          },
        ],
      );
    });

    test(`${kind.name} default(null) without nullable is invalid`, () => {
      const path = ["articles", kind.field];
      expectSchemaError(
        () => compileCollection({ [kind.field]: declared(kind.base().default(null)) }),
        [
          {
            code: "invalid_default",
            path,
            causes: [{ code: "invalid_type", path, expected: kind.expected, received: "null" }],
          },
        ],
      );
    });
  }

  test("a reused declaration reports the path of each field that uses it", () => {
    const rating = number().max(5);
    expectFailure(
      compileValid({ first: rating, second: rating }).validate({ first: 6, second: 7 }),
      [
        { code: "too_large", path: ["first"], maximum: 5, actual: 6 },
        { code: "too_large", path: ["second"], maximum: 5, actual: 7 },
      ],
    );
  });

  test("frozen input works with default insertion and undefined omission", () => {
    const input = Object.freeze({ featured: undefined, updatedAt: "2026-02-14T09:00+11:00" });
    const compiled = compileValid({
      rating: number().default(-0),
      featured: boolean().optional(),
      updatedAt: datetime(),
    });
    const result = compiled.validate(input);
    expectSuccess(result, { rating: 0, updatedAt: "2026-02-13T22:00:00.000Z" });
    expect(Object.is((result as unknown as { data: { rating: number } }).data.rating, 0)).toBe(
      true,
    );
    expect(Reflect.ownKeys(input)).toEqual(["featured", "updatedAt"]);
    expect(input.updatedAt).toBe("2026-02-14T09:00+11:00");
  });
});

describe("issue order across scalar fields", () => {
  test("declared fields report in schema order, then unknown fields alphabetically", () => {
    const compiled = compileValid({
      title: text(),
      rating: number().int().min(1).max(5),
      publishedOn: date(),
      featured: boolean(),
      location: point(),
      updatedAt: datetime(),
      data: json(),
    });
    expectFailure(
      compiled.validate({
        zeta: 1,
        data: { a: undefined },
        updatedAt: 5,
        location: { lng: 181, lat: 91 },
        featured: "yes",
        publishedOn: "2026-02-30",
        rating: 6.5,
        title: "Hi",
        alpha: 2,
      }),
      [
        { code: "not_integer", path: ["rating"] },
        { code: "too_large", path: ["rating"], maximum: 5, actual: 6.5 },
        { code: "invalid_date", path: ["publishedOn"] },
        { code: "invalid_type", path: ["featured"], expected: "boolean", received: "string" },
        { code: "out_of_range", path: ["location", "lat"], minimum: -90, maximum: 90, actual: 91 },
        {
          code: "out_of_range",
          path: ["location", "lng"],
          minimum: -180,
          maximum: 180,
          actual: 181,
        },
        { code: "invalid_type", path: ["updatedAt"], expected: "string", received: "number" },
        { code: "invalid_json", path: ["data", "a"] },
        { code: "unknown_field", path: ["alpha"] },
        { code: "unknown_field", path: ["zeta"] },
      ],
    );
  });
});

describe("bound declarations", () => {
  const ratingPath = ["articles", "rating"];

  test("non-finite and non-numeric number bounds are invalid_bound", () => {
    for (const bad of [NaN, Infinity, -Infinity, "1", 1n, null, undefined]) {
      expectSchemaError(
        () => compileCollection({ rating: number().min(bad as never) }),
        [{ code: "invalid_bound", path: ratingPath, constraint: "min" }],
      );
      expectSchemaError(
        () => compileCollection({ rating: number().max(bad as never) }),
        [{ code: "invalid_bound", path: ratingPath, constraint: "max" }],
      );
    }
  });

  test("fractional, negative and unsafe bounds are valid without int", () => {
    const compiled = compileValid({
      rating: number()
        .min(-1.5)
        .max(2 ** 60),
    });
    expectSuccess(compiled.validate({ rating: -1.5 }), { rating: -1.5 });
    expectSuccess(compiled.validate({ rating: 2 ** 60 }), { rating: 2 ** 60 });
  });

  test("invalid bounds are deduplicated per constraint and ordered min then max", () => {
    expectSchemaError(
      () =>
        compileCollection({
          rating: number().max(NaN).min(Infinity).max(-Infinity).min(NaN).default(3),
        }),
      [
        { code: "invalid_bound", path: ratingPath, constraint: "min" },
        { code: "invalid_bound", path: ratingPath, constraint: "max" },
      ],
    );
  });

  test("an invalid bound is not hidden by a later valid one", () => {
    expectSchemaError(
      () => compileCollection({ rating: number().min(NaN).min(3) }),
      [{ code: "invalid_bound", path: ratingPath, constraint: "min" }],
    );
  });

  test("an invalid minimum does not hide a default violating an independent maximum", () => {
    expectSchemaError(
      () => compileCollection({ rating: number().min(NaN).max(2).default(3) }),
      [
        { code: "invalid_bound", path: ratingPath, constraint: "min" },
        {
          code: "invalid_default",
          path: ratingPath,
          causes: [{ code: "too_large", path: ratingPath, maximum: 2, actual: 3 }],
        },
      ],
    );
  });

  test("an invalid integer bound still lets the default fail its integer check", () => {
    expectSchemaError(
      () => compileCollection({ rating: number().int().min(1.5).default(2.5) }),
      [
        { code: "invalid_bound", path: ratingPath, constraint: "min" },
        {
          code: "invalid_default",
          path: ratingPath,
          causes: [{ code: "not_integer", path: ratingPath }],
        },
      ],
    );
  });

  test("conflicting bounds after tightening are reported with the effective values", () => {
    expectSchemaError(
      () => compileCollection({ rating: number().min(1).max(5).min(6) }),
      [{ code: "conflicting_bounds", path: ratingPath, minimum: 6, maximum: 5 }],
    );
  });

  test("conflicting bounds suppress checks of the default against the range", () => {
    expectSchemaError(
      () => compileCollection({ rating: number().min(5).max(1).default(3) }),
      [{ code: "conflicting_bounds", path: ratingPath, minimum: 5, maximum: 1 }],
    );
  });

  test("conflicting defaults rank before invalid bounds", () => {
    expectSchemaError(
      () => compileCollection({ rating: number().min(NaN).default(1).default(2) }),
      [
        { code: "conflicting_defaults", path: ratingPath },
        { code: "invalid_bound", path: ratingPath, constraint: "min" },
      ],
    );
  });

  test("invalid bounds on date kinds use the same deduplication and order", () => {
    expectSchemaError(
      () =>
        compileCollection({
          publishedOn: date().max("never").min("2026-02-30").max("2026-13-01"),
        }),
      [
        { code: "invalid_bound", path: ["articles", "publishedOn"], constraint: "min" },
        { code: "invalid_bound", path: ["articles", "publishedOn"], constraint: "max" },
      ],
    );
  });
});

describe("default validation at compilation", () => {
  test("defaults are checked against the complete declaration in either modifier order", () => {
    const ratingPath = ["articles", "rating"];
    for (const field of [number().max(5).default(6), number().default(6).max(5)]) {
      expectSchemaError(
        () => compileCollection({ rating: field }),
        [
          {
            code: "invalid_default",
            path: ratingPath,
            causes: [{ code: "too_large", path: ratingPath, maximum: 5, actual: 6 }],
          },
        ],
      );
    }
  });

  test("a default reports every cause in issue order", () => {
    const ratingPath = ["articles", "rating"];
    expectSchemaError(
      () => compileCollection({ rating: number().int().min(3).default(2.5) }),
      [
        {
          code: "invalid_default",
          path: ratingPath,
          causes: [
            { code: "not_integer", path: ratingPath },
            { code: "too_small", path: ratingPath, minimum: 3, actual: 2.5 },
          ],
        },
      ],
    );
  });

  test("wrong-kind defaults report invalid_type causes", () => {
    const cases: [string, FieldDeclaration, ExpectedType, string][] = [
      ["rating", number().default("5" as never), "number", "string"],
      ["rating", number().default(NaN), "number", "number"],
      ["featured", boolean().default(0 as never), "boolean", "number"],
      ["publishedOn", date().default(new Date() as never), "string", "object"],
      ["updatedAt", datetime().default(1 as never), "string", "number"],
      ["location", point().default([1, 2] as never), "object", "array"],
    ];
    for (const [field, declaration, expected, received] of cases) {
      const path = ["articles", field];
      expectSchemaError(
        () => compileCollection({ [field]: declaration }),
        [
          {
            code: "invalid_default",
            path,
            causes: [{ code: "invalid_type", path, expected, received } as never],
          },
        ],
      );
    }
  });

  test("a negative zero default is stored as zero and equals a zero default", () => {
    const result = compileValid({ rating: number().default(-0).default(0) }).validate({});
    expectSuccess(result, { rating: 0 });
    expect(Object.is((result as unknown as { data: { rating: number } }).data.rating, 0)).toBe(
      true,
    );
  });

  test("different number defaults conflict", () => {
    expectSchemaError(
      () => compileCollection({ rating: number().default(1).default(2) }),
      [{ code: "conflicting_defaults", path: ["articles", "rating"] }],
    );
  });

  test("schema errors carry collection and field paths for every collection", () => {
    expectSchemaError(
      () =>
        compileSchema({
          articles: collection({ rating: number().min(5).max(1) }),
          pages: collection({ publishedOn: date().default("2026-02-30") }),
        }),
      [
        { code: "conflicting_bounds", path: ["articles", "rating"], minimum: 5, maximum: 1 },
        {
          code: "invalid_default",
          path: ["pages", "publishedOn"],
          causes: [{ code: "invalid_date", path: ["pages", "publishedOn"] }],
        },
      ],
    );
  });
});
