import type { ReceivedType, ValidationIssue } from "@aircastle/schema";
import { describe, expect, test } from "vite-plus/test";
import { parseContentError, type ContentError } from "./index.ts";
import { freezeDeep } from "./support/fixtures.ts";

type BareCode = Exclude<ContentError["code"], "validation_failed" | "unique_conflict">;
const bareCodes: Record<BareCode, true> = {
  invalid_request: true,
  unauthorized: true,
  forbidden: true,
  not_found: true,
  schema_mismatch: true,
  schema_conflict: true,
  migration_required: true,
  payload_too_large: true,
  internal_error: true,
  unavailable: true,
  transport_error: true,
  unknown_write_outcome: true,
};
const receivedTypes: Record<ReceivedType, true> = {
  string: true,
  number: true,
  boolean: true,
  null: true,
  undefined: true,
  array: true,
  object: true,
  bigint: true,
  symbol: true,
  function: true,
};
const simpleIssues = [
  "required",
  "invalid_document",
  "invalid_unicode",
  "invalid_character",
  "invalid_email",
  "invalid_url",
  "unknown_field",
] as const;
const message = "Readable diagnostic wording";
const required: ValidationIssue = { code: "required", path: ["title"], message };
const short: ValidationIssue = {
  code: "too_short",
  path: ["title"],
  message,
  minimum: 2,
  actual: 1,
  unit: "graphemes",
};
const long: ValidationIssue = {
  code: "too_long",
  path: ["title"],
  message,
  maximum: 1,
  actual: 2,
  unit: "graphemes",
};

function expectedIssue(value: ValidationIssue) {
  return { ...value, message: expect.any(String) };
}

function wrapped(value: unknown) {
  return { code: "validation_failed", issues: [value] };
}

describe("accepted structured content errors", () => {
  test.each(Object.keys(bareCodes) as BareCode[])("accepts %s", (code) => {
    expect(parseContentError({ code })).toMatchObject({ code });
  });

  test.each(["slug", "__proto__", "constructor"])("accepts unique field %s", (field) => {
    expect(parseContentError({ code: "unique_conflict", field })).toMatchObject({
      code: "unique_conflict",
      field,
    });
  });

  test.each(simpleIssues)("accepts validation issue %s", (code) => {
    const value: ValidationIssue = {
      code,
      path: code === "invalid_document" ? [] : ["title"],
      message,
    };
    expect(parseContentError(wrapped(value))).toMatchObject({
      code: "validation_failed",
      issues: [expectedIssue(value)],
    });
  });

  test.each(Object.keys(receivedTypes) as ReceivedType[])(
    "accepts invalid_type received %s",
    (received) => {
      const value: ValidationIssue = {
        code: "invalid_type",
        path: ["title"],
        message,
        expected: "string",
        received,
      };
      expect(parseContentError(wrapped(value))).toMatchObject({
        code: "validation_failed",
        issues: [expectedIssue(value)],
      });
    },
  );

  test.each([
    short,
    long,
    { code: "too_short", path: ["title"], message, minimum: 1, actual: 0, unit: "graphemes" },
    { code: "too_long", path: ["title"], message, maximum: 0, actual: 1, unit: "graphemes" },
    { code: "invalid_choice", path: ["status"], message, allowed: ["", "draft", "published"] },
  ] satisfies ValidationIssue[])("accepts $code with its exact structured details", (value) => {
    expect(parseContentError(wrapped(value))).toMatchObject({
      code: "validation_failed",
      issues: [expectedIssue(value)],
    });
  });

  test("retains string and zero-based numeric path segments in order", () => {
    const value: ValidationIssue = { code: "required", path: ["content", 0, "title", 2], message };
    expect(parseContentError(wrapped(value))).toMatchObject({
      code: "validation_failed",
      issues: [expectedIssue(value)],
    });
  });

  test("retains every issue in order, including frozen readonly input", () => {
    const first: ValidationIssue = { code: "required", path: ["title"], message: "One wording" };
    const second: ValidationIssue = {
      code: "invalid_choice",
      path: ["status"],
      allowed: ["draft", "published"],
      message: "A different wording",
    };
    const input = freezeDeep({ code: "validation_failed", issues: [first, second, long] });
    expect(parseContentError(input)).toMatchObject({
      code: "validation_failed",
      issues: [expectedIssue(first), expectedIssue(second), expectedIssue(long)],
    });
    expect(input.issues.map((value) => value.code)).toEqual([
      "required",
      "invalid_choice",
      "too_long",
    ]);
  });
});

describe("malformed content errors", () => {
  test.each([
    ["null root", null],
    ["array root", []],
    ["string root", "not_found"],
    ["missing code", {}],
    ["nonstrings as code", { code: 1 }],
    ["unknown code", { code: "unknown_error" }],
    ["missing issues", { code: "validation_failed" }],
    ["null issues", { code: "validation_failed", issues: null }],
    ["object issues", { code: "validation_failed", issues: {} }],
    ["empty issues", { code: "validation_failed", issues: [] }],
    ["null issue", { code: "validation_failed", issues: [null] }],
    [
      "invalid later issue",
      { code: "validation_failed", issues: [required, { code: "required", path: ["slug"] }] },
    ],
    ["missing unique field", { code: "unique_conflict" }],
    ["null unique field", { code: "unique_conflict", field: null }],
    ["numeric unique field", { code: "unique_conflict", field: 1 }],
  ])("rejects %s", (_name, input) => {
    expect(parseContentError(input)).toBeUndefined();
  });

  test.each([
    ["missing issue code", { path: ["title"], message }],
    ["numeric issue code", { code: 1, path: ["title"], message }],
    ["unknown issue code", { code: "bad_field", path: ["title"], message }],
    ["missing message", { code: "required", path: ["title"] }],
    ["numeric message", { ...required, message: 1 }],
    ["null message", { ...required, message: null }],
    ["missing path", { code: "required", message }],
    ["null path", { ...required, path: null }],
    ["string path", { ...required, path: "title" }],
    ["object path", { ...required, path: {} }],
    ["null path segment", { ...required, path: ["content", null] }],
    ["boolean path segment", { ...required, path: ["content", true] }],
    ["object path segment", { ...required, path: ["content", {}] }],
    ["negative array index", { ...required, path: ["content", -1] }],
    ["fractional array index", { ...required, path: ["content", 1.5] }],
    ["nonfinite array index", { ...required, path: ["content", Infinity] }],
    [
      "missing expected type",
      { code: "invalid_type", path: ["title"], message, received: "number" },
    ],
    [
      "wrong expected type",
      { code: "invalid_type", path: ["title"], message, expected: "number", received: "number" },
    ],
    [
      "missing received type",
      { code: "invalid_type", path: ["title"], message, expected: "string" },
    ],
    [
      "numeric received type",
      { code: "invalid_type", path: ["title"], message, expected: "string", received: 1 },
    ],
    [
      "unknown received type",
      { code: "invalid_type", path: ["title"], message, expected: "string", received: "date" },
    ],
    ["missing allowed choices", { code: "invalid_choice", path: ["status"], message }],
    ["null allowed choices", { code: "invalid_choice", path: ["status"], message, allowed: null }],
    [
      "string allowed choices",
      { code: "invalid_choice", path: ["status"], message, allowed: "draft" },
    ],
    ["empty allowed choices", { code: "invalid_choice", path: ["status"], message, allowed: [] }],
    [
      "mixed allowed choices",
      { code: "invalid_choice", path: ["status"], message, allowed: ["draft", 1] },
    ],
  ])("rejects %s", (_name, value) => {
    expect(parseContentError(wrapped(value))).toBeUndefined();
  });

  test.each([short, long])("rejects malformed $code bounds and counts", (valid) => {
    const bound = valid.code === "too_short" ? "minimum" : "maximum";
    for (const invalid of [undefined, null, "1", -1, 0.5, NaN, Infinity]) {
      expect(
        parseContentError(wrapped({ ...valid, [bound]: invalid })),
        String(invalid),
      ).toBeUndefined();
      expect(
        parseContentError(wrapped({ ...valid, actual: invalid })),
        String(invalid),
      ).toBeUndefined();
    }
    for (const unit of [undefined, null, "bytes", 1]) {
      expect(parseContentError(wrapped({ ...valid, unit })), String(unit)).toBeUndefined();
    }
  });
});
