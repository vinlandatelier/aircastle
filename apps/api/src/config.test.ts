import { describe, expect, expectTypeOf, test } from "vite-plus/test";
import { readConfig } from "./config.ts";

const DATABASE_URL = "postgresql://aircastle:secret@127.0.0.1:43123/aircastle";

describe("API configuration", () => {
  test("supplies defaults for everything except the database URL", () => {
    expect(readConfig({ DATABASE_URL })).toEqual({
      PORT: 43122,
      LOG_LEVEL: "info",
      DATABASE_URL,
      AIRCASTLE_MAX_REQUEST_BYTES: 1_048_576,
    });
  });

  test("parses configured values and ignores unrelated environment variables", () => {
    const config = readConfig({
      PORT: "43130",
      NODE_ENV: "production",
      LOG_LEVEL: "warn",
      DATABASE_URL,
      AIRCASTLE_DATABASE_NAMESPACE: "aircastle_preview",
      AIRCASTLE_MAX_REQUEST_BYTES: "2048",
      UNRELATED: "ignored",
    });

    expect(config).toEqual({
      PORT: 43130,
      LOG_LEVEL: "warn",
      DATABASE_URL,
      AIRCASTLE_DATABASE_NAMESPACE: "aircastle_preview",
      AIRCASTLE_MAX_REQUEST_BYTES: 2048,
    });
    expectTypeOf(config.PORT).toEqualTypeOf<number>();
    expectTypeOf(config.DATABASE_URL).toEqualTypeOf<string>();
    expectTypeOf(config.AIRCASTLE_MAX_REQUEST_BYTES).toEqualTypeOf<number>();
  });

  test.each([{}, { DATABASE_URL: "" }])("rejects a missing or empty database URL: %o", (env) => {
    expect(() => readConfig(env)).toThrow("DATABASE_URL");
  });

  test.each(["1", "65535"])("accepts valid port boundary %s", (PORT) => {
    expect(readConfig({ DATABASE_URL, PORT }).PORT).toBe(Number(PORT));
  });

  test.each(["0", "-1", "65536", "43122.5", "not-a-port", ""])(
    "rejects invalid port %s",
    (PORT) => {
      expect(() => readConfig({ DATABASE_URL, PORT })).toThrow("PORT");
    },
  );

  test.each(["1", "9007199254740991"])("accepts request byte limit %s", (limit) => {
    expect(
      readConfig({ DATABASE_URL, AIRCASTLE_MAX_REQUEST_BYTES: limit }).AIRCASTLE_MAX_REQUEST_BYTES,
    ).toBe(Number(limit));
  });

  test.each(["0", "-1", "1.5", "", "unlimited", "9007199254740992"])(
    "rejects request byte limit %s",
    (limit) => {
      expect(() => readConfig({ DATABASE_URL, AIRCASTLE_MAX_REQUEST_BYTES: limit })).toThrow(
        "AIRCASTLE_MAX_REQUEST_BYTES",
      );
    },
  );

  test("rejects unknown log levels", () => {
    expect(() => readConfig({ DATABASE_URL, LOG_LEVEL: "verbose" })).toThrow("LOG_LEVEL");
  });

  test.each(["fatal", "error", "warn", "info", "debug", "trace", "silent"])(
    "accepts the %s log level",
    (LOG_LEVEL) => {
      expect(readConfig({ DATABASE_URL, LOG_LEVEL }).LOG_LEVEL).toBe(LOG_LEVEL);
    },
  );
});
