import { describe, expect, test } from "vite-plus/test";
import { point, type ReceivedType } from "../../src/index.ts";
import { compileCollection } from "../support/collections.ts";
import { compileValid } from "../support/compile-valid.ts";
import { expectFailure, expectSchemaError, expectSuccess } from "../support/assertions.ts";

const path = ["articles", "location"];

describe("points", () => {
  test("P1 accepts a latitude and longitude pair unchanged", () => {
    expectSuccess(
      compileValid({ location: point() }).validate({ location: { lat: -33.86, lng: 151.21 } }),
      { location: { lat: -33.86, lng: 151.21 } },
    );
  });

  test("P2 accepts every corner of the inclusive range", () => {
    const collection = compileValid({ location: point() });
    for (const location of [
      { lat: 90, lng: -180 },
      { lat: -90, lng: 180 },
      { lat: 0, lng: 0 },
      { lng: 151.21, lat: -33.86 },
    ]) {
      expectSuccess(collection.validate({ location }), { location });
    }
  });

  test("P3 reports a latitude outside -90 to 90", () => {
    expectFailure(
      compileValid({ location: point() }).validate({ location: { lat: 90.1, lng: 0 } }),
      [
        {
          code: "out_of_range",
          path: ["location", "lat"],
          minimum: -90,
          maximum: 90,
          actual: 90.1,
        },
      ],
    );
  });

  test("reports a longitude outside -180 to 180", () => {
    expectFailure(
      compileValid({ location: point() }).validate({ location: { lat: 0, lng: -180.5 } }),
      [
        {
          code: "out_of_range",
          path: ["location", "lng"],
          minimum: -180,
          maximum: 180,
          actual: -180.5,
        },
      ],
    );
  });

  test("reports latitude before longitude whatever the key order", () => {
    expectFailure(
      compileValid({ location: point() }).validate({ location: { lng: 181, lat: -91 } }),
      [
        { code: "out_of_range", path: ["location", "lat"], minimum: -90, maximum: 90, actual: -91 },
        {
          code: "out_of_range",
          path: ["location", "lng"],
          minimum: -180,
          maximum: 180,
          actual: 181,
        },
      ],
    );
  });

  test("P4 rejects non-objects with invalid_type expected object", () => {
    const collection = compileValid({ location: point() });
    const cases: [unknown, ReceivedType][] = [
      [[151.21, -33.86], "array"],
      ["-33.86,151.21", "string"],
      [5, "number"],
    ];
    for (const [location, received] of cases) {
      expectFailure(collection.validate({ location }), [
        { code: "invalid_type", path: ["location"], expected: "object", received },
      ]);
    }
  });

  test("P4 rejects wrong, missing and extra keys with one invalid_point", () => {
    const collection = compileValid({ location: point() });
    for (const location of [{ lat: "1", lng: 2 }, { lat: 1 }, { lat: 1, lng: 2, alt: 3 }]) {
      expectFailure(collection.validate({ location }), [
        { code: "invalid_point", path: ["location"] },
      ]);
    }
  });

  test("non-finite coordinates and shape errors stop before range checks", () => {
    const collection = compileValid({ location: point() });
    for (const location of [
      {},
      { lng: 2 },
      { lat: NaN, lng: 0 },
      { lat: 0, lng: Infinity },
      { lat: -Infinity, lng: 500 },
      { lat: 1n, lng: 2 },
      { lat: null, lng: 2 },
      { lat: 95, lng: 2, alt: 3 },
      { latitude: 1, longitude: 2 },
    ]) {
      expectFailure(collection.validate({ location }), [
        { code: "invalid_point", path: ["location"] },
      ]);
    }
  });

  test("rejects an accessor coordinate with one invalid_point without invoking it", () => {
    let calls = 0;
    const location = {
      get lat() {
        calls++;
        return 1;
      },
      lng: 2,
    };
    expectFailure(compileValid({ location: point() }).validate({ location }), [
      { code: "invalid_point", path: ["location"] },
    ]);
    expect(calls).toBe(0);
  });

  test("null needs nullable", () => {
    expectFailure(compileValid({ location: point() }).validate({ location: null }), [
      { code: "invalid_type", path: ["location"], expected: "object", received: "null" },
    ]);
    expectSuccess(compileValid({ location: point().nullable() }).validate({ location: null }), {
      location: null,
    });
  });

  test("an out-of-range default is rejected with the coordinate path", () => {
    expectSchemaError(
      () => compileCollection({ location: point().default({ lat: 91, lng: 0 }) }),
      [
        {
          code: "invalid_default",
          path,
          causes: [
            {
              code: "out_of_range",
              path: ["articles", "location", "lat"],
              minimum: -90,
              maximum: 90,
              actual: 91,
            },
          ],
        },
      ],
    );
  });

  test("a malformed default is rejected with invalid_point", () => {
    expectSchemaError(
      () => compileCollection({ location: point().default({ lat: 1 } as never) }),
      [{ code: "invalid_default", path, causes: [{ code: "invalid_point", path }] }],
    );
  });

  test("repeated defaults with the same coordinates in another key order do not conflict", () => {
    expectSuccess(
      compileValid({
        location: point().default({ lat: 1, lng: 2 }).default({ lng: 2, lat: 1 }),
      }).validate({}),
      { location: { lat: 1, lng: 2 } },
    );
    expectSchemaError(
      () =>
        compileCollection({
          location: point().default({ lat: 1, lng: 2 }).default({ lat: 2, lng: 1 }),
        }),
      [{ code: "conflicting_defaults", path }],
    );
  });

  test("a default is captured when declared", () => {
    const source = { lat: 1, lng: 2 };
    const field = point().default(source);
    source.lat = 3;
    expectSuccess(compileValid({ location: field }).validate({}), {
      location: { lat: 1, lng: 2 },
    });
  });

  test("mutating a returned default does not change later validations", () => {
    const collection = compileValid({ location: point().default({ lat: 1, lng: 2 }) });
    const first = collection.validate({});
    expectSuccess(first, { location: { lat: 1, lng: 2 } });
    (first as unknown as { data: { location: { lat: number } } }).data.location.lat = 3;
    expectSuccess(collection.validate({}), { location: { lat: 1, lng: 2 } });
  });
});
