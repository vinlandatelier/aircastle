import { authEmail, authSetupInput, authSignInInput } from "@aircastle/contracts";
import { type } from "arktype";
import { describe, expect, expectTypeOf, test } from "vite-plus/test";

const validEmails = [
  ["simple address", "alex@example.test", "alex@example.test"],
  ["trim and lowercase", " \tAlex.Smith+News@EXAMPLE.TEST\r\n", "alex.smith+news@example.test"],
  [
    "all unquoted punctuation",
    "a!#$%&'*+/=?^_`{|}~-z@example.test",
    "a!#$%&'*+/=?^_`{|}~-z@example.test",
  ],
  ["one-character local and domain labels", "a@b.c", "a@b.c"],
  ["digits and internal hyphens", "123@a-1.2-b.test", "123@a-1.2-b.test"],
  ["64-character local part", `${"a".repeat(64)}@example.test`, `${"a".repeat(64)}@example.test`],
  ["63-character domain label", `a@${"b".repeat(63)}.test`, `a@${"b".repeat(63)}.test`],
  [
    "254-character address",
    `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(61)}`,
    `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(61)}`,
  ],
] as const;

const invalidEmails: readonly (readonly [string, unknown])[] = [
  ["missing", undefined],
  ["null", null],
  ["number", 42],
  ["array", ["alex@example.test"]],
  ["object", { email: "alex@example.test" }],
  ["empty", ""],
  ["whitespace only", " \t\n"],
  ["missing at sign", "alex.example.test"],
  ["multiple at signs", "alex@@example.test"],
  ["empty local part", "@example.test"],
  ["65-character local part", `${"a".repeat(65)}@example.test`],
  ["leading local dot", ".alex@example.test"],
  ["trailing local dot", "alex.@example.test"],
  ["consecutive local dots", "alex..smith@example.test"],
  ["quoted local part", '"alex"@example.test'],
  ["unicode local part", "álëx@example.test"],
  ["unicode letter that lowercases to ASCII", "K@example.test"],
  ["unicode domain", "alex@exämple.test"],
  ["embedded local space", "alex smith@example.test"],
  ["embedded domain tab", "alex@exam\tple.test"],
  ["embedded newline", "alex\n@example.test"],
  ["control character", "alex\u0000@example.test"],
  ["non-ASCII local symbol", "alex\u007f@example.test"],
  ["parenthesis", "alex(comment)@example.test"],
  ["colon", "alex:smith@example.test"],
  ["semicolon", "alex;smith@example.test"],
  ["comma", "alex,smith@example.test"],
  ["backslash", "alex\\smith@example.test"],
  ["local brackets", "alex[smith]@example.test"],
  ["angle brackets", "<alex>@example.test"],
  ["missing domain", "alex@"],
  ["single domain label", "alex@localhost"],
  ["empty first domain label", "alex@.example.test"],
  ["empty middle domain label", "alex@example..test"],
  ["empty last domain label", "alex@example.test."],
  ["64-character domain label", `alex@${"b".repeat(64)}.test`],
  ["leading domain hyphen", "alex@-example.test"],
  ["trailing domain hyphen", "alex@example-.test"],
  ["leading final-label hyphen", "alex@example.-test"],
  ["trailing final-label hyphen", "alex@example.test-"],
  ["domain underscore", "alex@exam_ple.test"],
  ["IPv4 literal", "alex@[127.0.0.1]"],
  ["IPv6 literal", "alex@[IPv6:::1]"],
  ["unbracketed IPv4 domain", "alex@127.0.0.1"],
  ["numeric top-level label", "alex@example.169"],
  [
    "255-character address",
    `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(62)}`,
  ],
];

const undeclaredFields = [
  ["role", "super_user"],
  ["roles", ["super_user"]],
  ["super_user", true],
  ["isSuperUser", true],
  ["id", "chosen-id"],
  ["userId", "chosen-id"],
  ["authority", "super_user"],
  ["permissions", ["*"]],
  ["setupComplete", true],
  ["emailVerified", true],
  ["callbackURL", "https://attacker.test"],
  ["redirectTo", "https://attacker.test"],
  ["unexpected", "value"],
] as const;

function expectFieldError(result: unknown, field: string) {
  expect(result).toBeInstanceOf(type.errors);
  if (result instanceof type.errors) {
    expect(result.map((issue) => [...issue.path])).toContainEqual([field]);
  }
}

describe("public auth contracts", () => {
  test("infers normalized output types from the public schemas", () => {
    expectTypeOf<typeof authEmail.infer>().toEqualTypeOf<string>();
    expectTypeOf<typeof authSetupInput.infer>().toEqualTypeOf<{ name: string; email: string }>();
    expectTypeOf<typeof authSignInInput.infer>().toEqualTypeOf<{ email: string }>();
  });

  test.each(validEmails)("authEmail normalizes %s", (_label, input, email) => {
    expect(authEmail(input)).toBe(email);
  });

  test.each(validEmails)("authSetupInput normalizes %s", (_label, input, email) => {
    expect(authSetupInput({ name: " Alex ", email: input })).toEqual({ name: "Alex", email });
  });

  test.each(validEmails)("authSignInInput normalizes %s", (_label, input, email) => {
    expect(authSignInInput({ email: input })).toEqual({ email });
  });

  test.each(invalidEmails)("authEmail rejects %s", (_label, email) => {
    expect(authEmail(email)).toBeInstanceOf(type.errors);
  });

  test.each(invalidEmails)("authSetupInput rejects %s on its email field", (_label, email) => {
    expectFieldError(authSetupInput({ name: "Alex", email }), "email");
  });

  test.each(invalidEmails)("authSignInInput rejects %s on its email field", (_label, email) => {
    expectFieldError(authSignInInput({ email }), "email");
  });

  test("normalizes case and surrounding whitespace to the same identity", () => {
    expect(authEmail(" Alex.Smith+News@Example.Test ")).toBe("alex.smith+news@example.test");
    expect(authEmail("alex.smith+news@example.test")).toBe("alex.smith+news@example.test");
  });

  test("keeps plus-tagged identities distinct", () => {
    expect(authEmail("alex.smith+news@example.test")).not.toBe(
      authEmail("alex.smith@example.test"),
    );
  });

  test("keeps dotted identities distinct", () => {
    expect(authEmail("alex.smith@example.test")).not.toBe(authEmail("alexsmith@example.test"));
  });

  test.each([
    ["one code point", " A ", "A"],
    ["internal spacing", " \tAlex  van\tSmith\n", "Alex  van\tSmith"],
    ["Unicode name", "  李 明  ", "李 明"],
    ["120 ASCII code points", "x".repeat(120), "x".repeat(120)],
    ["120 astral code points", "😀".repeat(120), "😀".repeat(120)],
    ["120 decomposed code points", "e\u0301".repeat(60), "e\u0301".repeat(60)],
    ["bounds after trimming", ` ${"😀".repeat(120)} `, "😀".repeat(120)],
  ])("accepts name with %s", (_label, name, normalized) => {
    expect(authSetupInput({ name, email: "alex@example.test" })).toEqual({
      name: normalized,
      email: "alex@example.test",
    });
  });

  test.each([
    ["missing", undefined],
    ["null", null],
    ["number", 42],
    ["array", ["Alex"]],
    ["object", { name: "Alex" }],
    ["empty", ""],
    ["trimmed empty", " \t\n\u2003"],
    ["121 ASCII code points", "x".repeat(121)],
    ["121 astral code points", "😀".repeat(121)],
    ["121 decomposed code points", `${"e\u0301".repeat(60)}x`],
    ["NUL character", "Al\u0000ex"],
    ["unpaired high surrogate", "Al\uD800ex"],
    ["unpaired low surrogate", "Al\uDC00ex"],
  ])("reports a name field error for %s", (_label, name) => {
    expectFieldError(authSetupInput({ name, email: "alex@example.test" }), "name");
  });

  test("reports both missing setup fields as standard ArkType field errors", () => {
    const result = authSetupInput({});
    expect(result).toBeInstanceOf(type.errors);
    if (result instanceof type.errors) {
      expect(result.map((issue) => [...issue.path])).toEqual(
        expect.arrayContaining([["name"], ["email"]]),
      );
    }
  });

  test("reports a missing sign-in email as a standard ArkType field error", () => {
    expectFieldError(authSignInInput({}), "email");
  });

  test.each([undefined, null, 42, "alex@example.test", [], true])(
    "authSetupInput rejects non-object request body %j",
    (input) => {
      expect(authSetupInput(input)).toBeInstanceOf(type.errors);
    },
  );

  test.each([undefined, null, 42, "alex@example.test", [], true])(
    "authSignInInput rejects non-object request body %j",
    (input) => {
      expect(authSignInInput(input)).toBeInstanceOf(type.errors);
    },
  );

  test.each(undeclaredFields)(
    "authSetupInput rejects undeclared %s instead of dropping it",
    (field, value) => {
      expectFieldError(
        authSetupInput({ name: "Alex", email: "alex@example.test", [field]: value }),
        field,
      );
    },
  );

  test.each(undeclaredFields)(
    "authSignInInput rejects undeclared %s instead of dropping it",
    (field, value) => {
      expectFieldError(authSignInInput({ email: "alex@example.test", [field]: value }), field);
    },
  );

  test("rejects a name in sign-in input", () => {
    expectFieldError(authSignInInput({ email: "alex@example.test", name: "Replacement" }), "name");
  });
});
