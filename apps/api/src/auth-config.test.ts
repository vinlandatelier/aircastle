import { describe, expect, expectTypeOf, test } from "vite-plus/test";
import { readAuthConfig } from "./config.ts";

const development = {
  AIRCASTLE_ENV: "development",
  AIRCASTLE_URL: "http://localhost:43121",
};

describe("auth environment configuration", () => {
  test.each([
    {},
    { AIRCASTLE_ENV: undefined },
    { AIRCASTLE_ENV: "" },
    { AIRCASTLE_ENV: "production" },
  ])("disables local auth for %j", (env) => {
    expect(readAuthConfig(env)).toEqual({ mode: "disabled" });
  });

  test.each([
    { NODE_ENV: "development" },
    { AIRCASTLE_AUTH_MODE: "development" },
    { AIRCASTLE_INITIAL_SUPER_USER_EMAIL: "alex@example.test" },
    { SMTP_HOST: "localhost" },
    { NODE_ENV: "development", AIRCASTLE_ENV: "production" },
  ])("requires explicit AIRCASTLE_ENV=development despite %j", (env) => {
    expect(readAuthConfig(env)).toEqual({ mode: "disabled" });
  });

  test.each(["test", "dev", "Development", "staging", " development "])(
    "rejects unapproved AIRCASTLE_ENV value %s with its approved diagnostic",
    (AIRCASTLE_ENV) => {
      expect(() => readAuthConfig({ AIRCASTLE_ENV })).toThrow(
        "AIRCASTLE_ENV must be development or production",
      );
    },
  );

  test("enables development mode with all approved defaults and no initial restriction", () => {
    expect(readAuthConfig(development)).toEqual({
      mode: "development",
      browserOrigin: "http://localhost:43121",
      limits: {
        email: { fiveMinutes: 5, oneHour: 20 },
        ip: { fiveMinutes: 10, oneHour: 30 },
        global: { fiveMinutes: 30, oneHour: 100 },
      },
    });
  });

  test.each(["production", "test"])("keeps product mode independent of NODE_ENV=%s", (NODE_ENV) => {
    expect(readAuthConfig({ ...development, NODE_ENV }).mode).toBe("development");
  });

  test("parses all six independent ceilings", () => {
    expect(
      readAuthConfig({
        ...development,
        AIRCASTLE_AUTH_EMAIL_LIMIT_5M: "7",
        AIRCASTLE_AUTH_EMAIL_LIMIT_1H: "21",
        AIRCASTLE_AUTH_IP_LIMIT_5M: "11",
        AIRCASTLE_AUTH_IP_LIMIT_1H: "31",
        AIRCASTLE_AUTH_GLOBAL_LIMIT_5M: "32",
        AIRCASTLE_AUTH_GLOBAL_LIMIT_1H: "101",
      }),
    ).toEqual({
      mode: "development",
      browserOrigin: "http://localhost:43121",
      limits: {
        email: { fiveMinutes: 7, oneHour: 21 },
        ip: { fiveMinutes: 11, oneHour: 31 },
        global: { fiveMinutes: 32, oneHour: 101 },
      },
    });
  });

  test("defaults omitted ceilings independently when one override is supplied", () => {
    expect(readAuthConfig({ ...development, AIRCASTLE_AUTH_IP_LIMIT_1H: "9" })).toEqual({
      mode: "development",
      browserOrigin: "http://localhost:43121",
      limits: {
        email: { fiveMinutes: 5, oneHour: 20 },
        ip: { fiveMinutes: 10, oneHour: 9 },
        global: { fiveMinutes: 30, oneHour: 100 },
      },
    });
  });

  describe.each([
    ["AIRCASTLE_AUTH_EMAIL_LIMIT_5M", "email", "fiveMinutes"],
    ["AIRCASTLE_AUTH_EMAIL_LIMIT_1H", "email", "oneHour"],
    ["AIRCASTLE_AUTH_IP_LIMIT_5M", "ip", "fiveMinutes"],
    ["AIRCASTLE_AUTH_IP_LIMIT_1H", "ip", "oneHour"],
    ["AIRCASTLE_AUTH_GLOBAL_LIMIT_5M", "global", "fiveMinutes"],
    ["AIRCASTLE_AUTH_GLOBAL_LIMIT_1H", "global", "oneHour"],
  ] as const)("%s", (variable, scope, window) => {
    test.each([
      ["1", 1],
      ["9007199254740991", 9007199254740991],
    ] as const)("accepts positive safe integer boundary %s", (input, expected) => {
      const config = readAuthConfig({ ...development, [variable]: input });
      expect(config.mode).toBe("development");
      if (config.mode === "development") {
        expect(config.limits[scope][window]).toBe(expected);
      }
    });

    test.each([
      "",
      "0",
      "-1",
      "1.5",
      "9007199254740992",
      "999999999999999999999999999999",
      "invalid",
      "Infinity",
      "NaN",
      "1e2",
      "0x10",
    ])("rejects invalid ceiling %j with a diagnostic naming its variable", (input) => {
      expect(() => readAuthConfig({ ...development, [variable]: input })).toThrow(variable);
    });
  });

  test("normalizes the optional initial identity with the shared email rules", () => {
    const config = readAuthConfig({
      ...development,
      AIRCASTLE_INITIAL_SUPER_USER_EMAIL: " \tAlex.Smith+News@EXAMPLE.TEST\n",
    });
    expect(config.mode).toBe("development");
    if (config.mode === "development") {
      expect(config.initialEmail).toBe("alex.smith+news@example.test");
    }
  });

  test("accepts initial email punctuation and total-length boundaries", () => {
    const punctuation = readAuthConfig({
      ...development,
      AIRCASTLE_INITIAL_SUPER_USER_EMAIL: "a!#$%&'*+/=?^_`{|}~-z@example.test",
    });
    const boundary = readAuthConfig({
      ...development,
      AIRCASTLE_INITIAL_SUPER_USER_EMAIL: `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(61)}`,
    });
    expect(punctuation.mode).toBe("development");
    expect(boundary.mode).toBe("development");
    if (punctuation.mode === "development" && boundary.mode === "development") {
      expect(punctuation.initialEmail).toBe("a!#$%&'*+/=?^_`{|}~-z@example.test");
      expect(boundary.initialEmail).toBe(
        `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(61)}`,
      );
    }
  });

  test.each([
    "",
    " \t\n",
    "alex",
    "alex@@example.test",
    ".alex@example.test",
    "alex.@example.test",
    "alex..smith@example.test",
    '"alex"@example.test',
    "álëx@example.test",
    "alex@exämple.test",
    "alex smith@example.test",
    "alex@localhost",
    "alex@[127.0.0.1]",
    "alex@-example.test",
    "alex@example-.test",
    "alex@example..test",
    `${"a".repeat(65)}@example.test`,
    `alex@${"b".repeat(64)}.test`,
    `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(62)}`,
  ])("rejects invalid configured initial email %j with a named diagnostic", (email) => {
    expect(() =>
      readAuthConfig({ ...development, AIRCASTLE_INITIAL_SUPER_USER_EMAIL: email }),
    ).toThrow("AIRCASTLE_INITIAL_SUPER_USER_EMAIL");
  });

  test("exposes a discriminated config type without enabled-only fields in disabled mode", () => {
    const config = readAuthConfig({});
    expectTypeOf(config.mode).toEqualTypeOf<"disabled" | "development">();
    if (config.mode === "development") {
      expectTypeOf(config.browserOrigin).toEqualTypeOf<string>();
      expectTypeOf(config.initialEmail).toEqualTypeOf<string | undefined>();
      expectTypeOf(config.limits.email.fiveMinutes).toEqualTypeOf<number>();
    } else {
      expectTypeOf(config).toEqualTypeOf<{ mode: "disabled" }>();
    }
  });
});

describe("configured local browser origin", () => {
  test.each([
    ["http://localhost:43121", "http://localhost:43121"],
    ["http://localhost:43200/", "http://localhost:43200"],
    ["http://127.0.0.1:43200", "http://127.0.0.1:43200"],
    ["http://[::1]:43200", "http://[::1]:43200"],
    ["https://localhost:443", "https://localhost"],
  ])("uses the explicitly configured loopback origin %s", (input, expected) => {
    const config = readAuthConfig({ ...development, AIRCASTLE_URL: input });
    expect(config).toMatchObject({ mode: "development", browserOrigin: expected });
  });

  test.each([
    undefined,
    "",
    "http://example.test:43121",
    "http://localhost.example.test:43121",
    "http://0.0.0.0:43121",
    "http://192.168.1.2:43121",
    "http://[::]:43121",
    "http://localhost@evil.test:43121",
    "http://user:password@localhost:43121",
    "http://localhost:43121/setup",
    "http://localhost:43121?next=evil",
    "http://localhost:43121#token",
    "ftp://localhost:43121",
    "//localhost:43121",
    "not a URL",
  ])("rejects absent or non-origin local configuration %j", (input) => {
    expect(() => readAuthConfig({ ...development, AIRCASTLE_URL: input })).toThrow("AIRCASTLE_URL");
  });

  test("does not infer the public URL from the internal listening port", () => {
    expect(() =>
      readAuthConfig({
        AIRCASTLE_ENV: "development",
        AIRCASTLE_PORT: "43122",
      }),
    ).toThrow("AIRCASTLE_URL");
  });

  test("disabled authentication does not require browser-origin configuration", () => {
    expect(readAuthConfig({ AIRCASTLE_ENV: "production" })).toEqual({ mode: "disabled" });
    expect(readAuthConfig({})).toEqual({ mode: "disabled" });
  });
});
