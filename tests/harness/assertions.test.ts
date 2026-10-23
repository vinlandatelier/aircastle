import { describe, expect, test } from "bun:test";
import { expectFailure, expectSchemaError, expectSuccess } from "../support/assertions.ts";

describe("assertion controls", () => {
  test("accepts omitted properties and an allowed output prototype", () => {
    expectSuccess(
      { ok: true, data: Object.assign(Object.create(null), { title: "Hi" }) },
      { title: "Hi" },
    );
  });

  test.each([
    { ok: true, data: { title: undefined } },
    { ok: true, data: {}, issues: [] },
    { ok: false, data: {} },
  ])("rejects incorrect success presence or wrapper keys: %j", (actual) => {
    expect(() => expectSuccess(actual, {})).toThrow();
  });

  const short = {
    code: "too_short" as const,
    path: ["title"],
    minimum: 3,
    actual: 2,
    unit: "graphemes" as const,
  };
  const unknown = { code: "unknown_field" as const, path: ["extra"] };
  const withMessage = { ...short, message: "Readable explanation." };

  test("accepts changed wording and additional unspecified diagnostic metadata", () => {
    expectFailure(
      {
        ok: false,
        issues: [{ ...withMessage, message: "Different readable wording.", diagnosticId: 7 }],
      },
      [short],
    );
  });

  test.each([
    { ok: false, issues: [] },
    { ok: false, issues: [withMessage], data: {} },
    { ok: false, issues: [{ ...withMessage, actual: 3 }] },
    { ok: false, issues: [{ ...withMessage, path: ["wrong"] }] },
    { ok: false, issues: [{ ...withMessage, message: "" }] },
    { ok: false, issues: [{ ...withMessage, minimum: undefined }] },
  ])("rejects a corrupted failure: %j", (actual) => {
    expect(() => expectFailure(actual, [short])).toThrow();
  });

  test("rejects reversed independent issues", () => {
    expect(() =>
      expectFailure(
        { ok: false, issues: [{ ...unknown, message: "Unknown field." }, withMessage] },
        [short, unknown],
      ),
    ).toThrow();
  });

  test("checks nested causes and rejects a generic setup exception", () => {
    const wanted = {
      code: "invalid_default" as const,
      path: ["articles", "title"],
      causes: [short],
    };
    const error = Object.assign(new Error("Invalid schema."), {
      name: "SchemaError",
      issues: [{ ...wanted, message: "Invalid default.", causes: [withMessage] }],
    });
    expectSchemaError(() => {
      throw error;
    }, [wanted]);
    expect(() =>
      expectSchemaError(() => {
        throw new Error("Missing export");
      }, [wanted]),
    ).toThrow();
    error.issues[0]!.causes[0]!.actual = 99;
    expect(() =>
      expectSchemaError(() => {
        throw error;
      }, [wanted]),
    ).toThrow();
  });
});
