import { describe, test } from "vite-plus/test";
import { date, datetime, type ReceivedType } from "../../src/index.ts";
import { compileCollection } from "../support/collections.ts";
import { compileValid } from "../support/compile-valid.ts";
import { expectFailure, expectSchemaError, expectSuccess } from "../support/assertions.ts";

const datePath = ["articles", "publishedOn"];
const datetimePath = ["articles", "updatedAt"];

describe("dates", () => {
  test("D1 accepts a leap day unchanged", () => {
    expectSuccess(compileValid({ publishedOn: date() }).validate({ publishedOn: "2024-02-29" }), {
      publishedOn: "2024-02-29",
    });
  });

  test("accepts proleptic Gregorian days at the range edges and century leap rules", () => {
    const collection = compileValid({ publishedOn: date() });
    for (const publishedOn of [
      "0001-01-01",
      "9999-12-31",
      "2000-02-29",
      "0400-02-29",
      "2026-02-14",
      "2026-12-31",
    ]) {
      expectSuccess(collection.validate({ publishedOn }), { publishedOn });
    }
  });

  test("D2 rejects impossible days, year zero and loose spellings", () => {
    const collection = compileValid({ publishedOn: date() });
    for (const publishedOn of [
      "2023-02-29",
      "2026-02-30",
      "2026-13-01",
      "0000-01-01",
      "2026-2-14",
      " 2026-02-14",
    ]) {
      expectFailure(collection.validate({ publishedOn }), [
        { code: "invalid_date", path: ["publishedOn"] },
      ]);
    }
  });

  test("rejects other strings that do not name a calendar day in range", () => {
    const collection = compileValid({ publishedOn: date() });
    for (const publishedOn of [
      "1900-02-29",
      "2026-04-31",
      "2026-00-10",
      "2026-01-00",
      "10000-01-01",
      "2026-02-14 ",
      "2026-02-14T00:00Z",
      "26-02-14",
      "2026/02/14",
      "",
    ]) {
      expectFailure(collection.validate({ publishedOn }), [
        { code: "invalid_date", path: ["publishedOn"] },
      ]);
    }
  });

  test("rejects non-strings with invalid_type expected string", () => {
    const collection = compileValid({ publishedOn: date() });
    const cases: [unknown, ReceivedType][] = [
      [20260214, "number"],
      [new Date("2026-02-14T00:00:00.000Z"), "object"],
      [true, "boolean"],
      [["2026-02-14"], "array"],
    ];
    for (const [publishedOn, received] of cases) {
      expectFailure(collection.validate({ publishedOn }), [
        { code: "invalid_type", path: ["publishedOn"], expected: "string", received },
      ]);
    }
  });

  test("D8 maximum is inclusive and violations report both dates", () => {
    const collection = compileValid({ publishedOn: date().max("2026-12-31") });
    expectSuccess(collection.validate({ publishedOn: "2026-12-31" }), {
      publishedOn: "2026-12-31",
    });
    expectFailure(collection.validate({ publishedOn: "2027-01-01" }), [
      { code: "too_late", path: ["publishedOn"], maximum: "2026-12-31", actual: "2027-01-01" },
    ]);
  });

  test("minimum is inclusive and violations report too_early", () => {
    const collection = compileValid({ publishedOn: date().min("2026-01-01") });
    expectSuccess(collection.validate({ publishedOn: "2026-01-01" }), {
      publishedOn: "2026-01-01",
    });
    expectFailure(collection.validate({ publishedOn: "2025-12-31" }), [
      { code: "too_early", path: ["publishedOn"], minimum: "2026-01-01", actual: "2025-12-31" },
    ]);
  });

  test("repeated date bounds tighten in either order", () => {
    for (const field of [
      date().min("2026-01-01").min("2026-06-01"),
      date().min("2026-06-01").min("2026-01-01"),
    ]) {
      expectFailure(compileValid({ publishedOn: field }).validate({ publishedOn: "2026-03-01" }), [
        { code: "too_early", path: ["publishedOn"], minimum: "2026-06-01", actual: "2026-03-01" },
      ]);
    }
  });

  test("invalid date bounds are invalid_bound, ordered min then max", () => {
    expectSchemaError(
      () => compileCollection({ publishedOn: date().min("2026-02-30") }),
      [{ code: "invalid_bound", path: datePath, constraint: "min" }],
    );
    expectSchemaError(
      () => compileCollection({ publishedOn: date().max("2026-01-01T00:00Z") }),
      [{ code: "invalid_bound", path: datePath, constraint: "max" }],
    );
    expectSchemaError(
      () =>
        compileCollection({
          publishedOn: date()
            .max(20260101 as never)
            .min("0000-01-01"),
        }),
      [
        { code: "invalid_bound", path: datePath, constraint: "min" },
        { code: "invalid_bound", path: datePath, constraint: "max" },
      ],
    );
  });

  test("a minimum after the maximum conflicts", () => {
    expectSchemaError(
      () => compileCollection({ publishedOn: date().min("2026-12-31").max("2026-01-01") }),
      [
        {
          code: "conflicting_bounds",
          path: datePath,
          minimum: "2026-12-31",
          maximum: "2026-01-01",
        },
      ],
    );
  });

  test("defaults are validated against the date rules and bounds", () => {
    expectSchemaError(
      () => compileCollection({ publishedOn: date().default("2026-02-30") }),
      [
        {
          code: "invalid_default",
          path: datePath,
          causes: [{ code: "invalid_date", path: datePath }],
        },
      ],
    );
    expectSchemaError(
      () => compileCollection({ publishedOn: date().max("2026-01-01").default("2026-06-01") }),
      [
        {
          code: "invalid_default",
          path: datePath,
          causes: [
            { code: "too_late", path: datePath, maximum: "2026-01-01", actual: "2026-06-01" },
          ],
        },
      ],
    );
    expectSchemaError(
      () => compileCollection({ publishedOn: date().default(20260101 as never) }),
      [
        {
          code: "invalid_default",
          path: datePath,
          causes: [
            { code: "invalid_type", path: datePath, expected: "string", received: "number" },
          ],
        },
      ],
    );
  });
});

describe("datetimes", () => {
  test("D3 normalizes an offset to the UTC instant", () => {
    expectSuccess(
      compileValid({ updatedAt: datetime() }).validate({
        updatedAt: "2026-02-14T09:00+11:00",
      }),
      { updatedAt: "2026-02-13T22:00:00.000Z" },
    );
  });

  test("D4 pads a one-digit fraction to milliseconds", () => {
    expectSuccess(
      compileValid({ updatedAt: datetime() }).validate({
        updatedAt: "2026-02-14T09:00:05.1Z",
      }),
      { updatedAt: "2026-02-14T09:00:05.100Z" },
    );
  });

  test("accepts seconds, one to three fraction digits, and offsets across their range", () => {
    const collection = compileValid({ updatedAt: datetime() });
    const cases: [string, string][] = [
      ["2026-02-14T09:00Z", "2026-02-14T09:00:00.000Z"],
      ["2026-02-14T09:00:59Z", "2026-02-14T09:00:59.000Z"],
      ["2026-02-14T09:00:05.12Z", "2026-02-14T09:00:05.120Z"],
      ["2026-02-14T09:00:05.123Z", "2026-02-14T09:00:05.123Z"],
      ["2026-02-14T09:00:05.007+01:00", "2026-02-14T08:00:05.007Z"],
      ["2026-02-14T09:00+00:00", "2026-02-14T09:00:00.000Z"],
      ["2026-02-14T09:00-00:00", "2026-02-14T09:00:00.000Z"],
      ["2026-02-14T23:59+23:59", "2026-02-14T00:00:00.000Z"],
      ["2026-02-14T00:00-23:59", "2026-02-14T23:59:00.000Z"],
      ["2026-02-14T09:00+05:30", "2026-02-14T03:30:00.000Z"],
      ["2024-02-28T23:30-01:00", "2024-02-29T00:30:00.000Z"],
      ["2025-02-28T23:30-01:00", "2025-03-01T00:30:00.000Z"],
      ["2026-12-31T23:00-01:30", "2027-01-01T00:30:00.000Z"],
      ["2024-02-29T12:00Z", "2024-02-29T12:00:00.000Z"],
    ];
    for (const [updatedAt, normalized] of cases) {
      expectSuccess(collection.validate({ updatedAt }), { updatedAt: normalized });
    }
  });

  test("accepts instants at the edges of years 0001 and 9999", () => {
    const collection = compileValid({ updatedAt: datetime() });
    const cases: [string, string][] = [
      ["0001-01-01T00:00Z", "0001-01-01T00:00:00.000Z"],
      ["0001-01-01T00:30+00:30", "0001-01-01T00:00:00.000Z"],
      ["9999-12-31T23:59:59.999Z", "9999-12-31T23:59:59.999Z"],
      ["9999-12-31T23:29-00:30", "9999-12-31T23:59:00.000Z"],
    ];
    for (const [updatedAt, normalized] of cases) {
      expectSuccess(collection.validate({ updatedAt }), { updatedAt: normalized });
    }
  });

  test("D5 rejects missing offsets, lowercase separators, leap seconds and long fractions", () => {
    const collection = compileValid({ updatedAt: datetime() });
    for (const updatedAt of [
      "2026-02-14T09:00",
      "2026-02-14t09:00Z",
      "2026-02-14T09:00:60Z",
      "2026-02-14T09:00:00.1234Z",
    ]) {
      expectFailure(collection.validate({ updatedAt }), [
        { code: "invalid_datetime", path: ["updatedAt"] },
      ]);
    }
  });

  test("rejects other malformed datetimes, hour 24 and out-of-range offsets", () => {
    const collection = compileValid({ updatedAt: datetime() });
    for (const updatedAt of [
      "2026-02-14T09:00z",
      "2026-02-14 09:00Z",
      "2026-02-14T24:00Z",
      "2026-02-14T24:00:00.000Z",
      "2026-02-14T09:60Z",
      "2026-02-14T9:00Z",
      "2026-02-14T09Z",
      "2026-02-14T09:00:05.Z",
      "2026-02-14T09:00:05,1Z",
      "2026-02-14T09:00+1100",
      "2026-02-14T09:00+11",
      "2026-02-14T09:00+24:00",
      "2026-02-14T09:00-24:00",
      "2026-02-14T09:00+00:60",
      "2026-02-14T09:00Z ",
      " 2026-02-14T09:00Z",
      "2026-02-14",
      "",
    ]) {
      expectFailure(collection.validate({ updatedAt }), [
        { code: "invalid_datetime", path: ["updatedAt"] },
      ]);
    }
  });

  test("rejects local dates that are not real days or are outside years 0001 to 9999", () => {
    const collection = compileValid({ updatedAt: datetime() });
    for (const updatedAt of [
      "2026-02-30T09:00Z",
      "2023-02-29T12:00Z",
      "2026-13-01T00:00Z",
      "0000-12-31T23:30-01:00",
      "10000-01-01T00:00Z",
    ]) {
      expectFailure(collection.validate({ updatedAt }), [
        { code: "invalid_datetime", path: ["updatedAt"] },
      ]);
    }
  });

  test("D6 rejects instants that normalize outside years 0001 to 9999", () => {
    const collection = compileValid({ updatedAt: datetime() });
    for (const updatedAt of ["0001-01-01T00:30+01:00", "9999-12-31T23:30-00:30"]) {
      expectFailure(collection.validate({ updatedAt }), [
        { code: "invalid_datetime", path: ["updatedAt"] },
      ]);
    }
  });

  test("rejects non-strings with invalid_type expected string", () => {
    const collection = compileValid({ updatedAt: datetime() });
    const cases: [unknown, ReceivedType][] = [
      [new Date("2026-02-14T09:00:00.000Z"), "object"],
      [1771059600000, "number"],
      [1771059600000n, "bigint"],
    ];
    for (const [updatedAt, received] of cases) {
      expectFailure(collection.validate({ updatedAt }), [
        { code: "invalid_type", path: ["updatedAt"], expected: "string", received },
      ]);
    }
  });

  test("D7 compares the minimum as an instant and reports normalized values", () => {
    const collection = compileValid({ updatedAt: datetime().min("2026-01-01T00:00Z") });
    expectFailure(collection.validate({ updatedAt: "2026-01-01T10:59+11:00" }), [
      {
        code: "too_early",
        path: ["updatedAt"],
        minimum: "2026-01-01T00:00:00.000Z",
        actual: "2025-12-31T23:59:00.000Z",
      },
    ]);
    expectSuccess(collection.validate({ updatedAt: "2026-01-01T11:00+11:00" }), {
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  test("the maximum is inclusive by instant", () => {
    const collection = compileValid({ updatedAt: datetime().max("2026-01-01T00:00Z") });
    expectSuccess(collection.validate({ updatedAt: "2026-01-01T11:00+11:00" }), {
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expectFailure(collection.validate({ updatedAt: "2026-01-01T11:01+11:00" }), [
      {
        code: "too_late",
        path: ["updatedAt"],
        maximum: "2026-01-01T00:00:00.000Z",
        actual: "2026-01-01T00:01:00.000Z",
      },
    ]);
  });

  test("repeated datetime bounds tighten by instant, not by spelling", () => {
    const later = "2026-01-01T00:00Z";
    const earlier = "2026-01-01T10:00+11:00";
    for (const field of [datetime().max(later).max(earlier), datetime().max(earlier).max(later)]) {
      expectFailure(
        compileValid({ updatedAt: field }).validate({ updatedAt: "2025-12-31T23:30Z" }),
        [
          {
            code: "too_late",
            path: ["updatedAt"],
            maximum: "2025-12-31T23:00:00.000Z",
            actual: "2025-12-31T23:30:00.000Z",
          },
        ],
      );
    }
    for (const field of [datetime().min(later).min(earlier), datetime().min(earlier).min(later)]) {
      expectFailure(
        compileValid({ updatedAt: field }).validate({ updatedAt: "2025-12-31T23:30Z" }),
        [
          {
            code: "too_early",
            path: ["updatedAt"],
            minimum: "2026-01-01T00:00:00.000Z",
            actual: "2025-12-31T23:30:00.000Z",
          },
        ],
      );
    }
  });

  test("invalid datetime bounds are invalid_bound", () => {
    expectSchemaError(
      () => compileCollection({ updatedAt: datetime().min("2026-01-01") }),
      [{ code: "invalid_bound", path: datetimePath, constraint: "min" }],
    );
    expectSchemaError(
      () => compileCollection({ updatedAt: datetime().max("2026-01-01T00:00") }),
      [{ code: "invalid_bound", path: datetimePath, constraint: "max" }],
    );
    expectSchemaError(
      () =>
        compileCollection({
          updatedAt: datetime()
            .max(new Date("2026-01-01T00:00:00.000Z") as never)
            .min("2026-01-01T00:00:60Z"),
        }),
      [
        { code: "invalid_bound", path: datetimePath, constraint: "min" },
        { code: "invalid_bound", path: datetimePath, constraint: "max" },
      ],
    );
  });

  test("conflicting datetime bounds compare instants and report normalized strings", () => {
    expectSchemaError(
      () =>
        compileCollection({
          updatedAt: datetime().min("2026-01-01T11:00+11:00").max("2025-12-31T00:00Z"),
        }),
      [
        {
          code: "conflicting_bounds",
          path: datetimePath,
          minimum: "2026-01-01T00:00:00.000Z",
          maximum: "2025-12-31T00:00:00.000Z",
        },
      ],
    );
    expectSchemaError(
      () =>
        compileCollection({
          updatedAt: datetime().min("2026-01-01T10:00-05:00").max("2026-01-01T12:00Z"),
        }),
      [
        {
          code: "conflicting_bounds",
          path: datetimePath,
          minimum: "2026-01-01T15:00:00.000Z",
          maximum: "2026-01-01T12:00:00.000Z",
        },
      ],
    );
  });

  test("bounds naming the same instant in different offsets do not conflict", () => {
    const collection = compileValid({
      updatedAt: datetime().min("2026-01-01T11:00+11:00").max("2026-01-01T00:00Z"),
    });
    expectSuccess(collection.validate({ updatedAt: "2025-12-31T19:00-05:00" }), {
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  test("D9 a default is normalized before it is applied", () => {
    expectSuccess(
      compileValid({ updatedAt: datetime().default("2026-02-14T09:00+11:00") }).validate({}),
      { updatedAt: "2026-02-13T22:00:00.000Z" },
    );
  });

  test("repeated defaults naming the same instant do not conflict", () => {
    expectSuccess(
      compileValid({
        updatedAt: datetime().default("2026-02-14T09:00+11:00").default("2026-02-13T22:00:00.000Z"),
      }).validate({}),
      { updatedAt: "2026-02-13T22:00:00.000Z" },
    );
    expectSchemaError(
      () =>
        compileCollection({
          updatedAt: datetime().default("2026-02-14T09:00Z").default("2026-02-14T09:00+11:00"),
        }),
      [{ code: "conflicting_defaults", path: datetimePath }],
    );
  });

  test("defaults are validated against the datetime rules and bounds", () => {
    expectSchemaError(
      () => compileCollection({ updatedAt: datetime().default("2026-02-14T09:00") }),
      [
        {
          code: "invalid_default",
          path: datetimePath,
          causes: [{ code: "invalid_datetime", path: datetimePath }],
        },
      ],
    );
    expectSchemaError(
      () =>
        compileCollection({
          updatedAt: datetime().min("2026-01-01T00:00Z").default("2026-01-01T10:59+11:00"),
        }),
      [
        {
          code: "invalid_default",
          path: datetimePath,
          causes: [
            {
              code: "too_early",
              path: datetimePath,
              minimum: "2026-01-01T00:00:00.000Z",
              actual: "2025-12-31T23:59:00.000Z",
            },
          ],
        },
      ],
    );
  });
});
