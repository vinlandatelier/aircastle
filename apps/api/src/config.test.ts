import { describe, expect, expectTypeOf, test } from "vite-plus/test";
import { readConfig } from "./config.ts";

describe("API configuration", () => {
  test("supplies development defaults without requiring a database", () => {
    expect(readConfig({})).toEqual({
      AIRCASTLE_PORT: 43122,
      AIRCASTLE_LOG_LEVEL: "info",
      AIRCASTLE_MAX_REQUEST_BYTES: 1_048_576,
    });
  });

  test("parses configured values and ignores unrelated environment variables", () => {
    const config = readConfig({
      AIRCASTLE_PORT: "43130",
      AIRCASTLE_LOG_LEVEL: "warn",
      AIRCASTLE_MAX_REQUEST_BYTES: "2048",
      UNRELATED: "ignored",
    });

    expect(config).toEqual({
      AIRCASTLE_PORT: 43130,
      AIRCASTLE_LOG_LEVEL: "warn",
      AIRCASTLE_MAX_REQUEST_BYTES: 2048,
    });
    expectTypeOf(config.AIRCASTLE_PORT).toEqualTypeOf<number>();
    expectTypeOf(config.AIRCASTLE_MAX_REQUEST_BYTES).toEqualTypeOf<number>();
  });

  test("ignores generic environment names and leaves runtime mode to the runtime", () => {
    expect(readConfig({ PORT: "45000", LOG_LEVEL: "silent", NODE_ENV: "custom" })).toEqual({
      AIRCASTLE_PORT: 43122,
      AIRCASTLE_LOG_LEVEL: "info",
      AIRCASTLE_MAX_REQUEST_BYTES: 1_048_576,
    });
  });

  test.each(["1", "65535"])("accepts valid port boundary %s", (AIRCASTLE_PORT) => {
    expect(readConfig({ AIRCASTLE_PORT }).AIRCASTLE_PORT).toBe(Number(AIRCASTLE_PORT));
  });

  test.each(["0", "-1", "65536", "43122.5", "not-a-port", ""])(
    "rejects invalid port %s",
    (AIRCASTLE_PORT) => {
      expect(() => readConfig({ AIRCASTLE_PORT })).toThrow("AIRCASTLE_PORT");
    },
  );

  test.each(["1", "9007199254740991"])("accepts request byte limit %s", (limit) => {
    expect(readConfig({ AIRCASTLE_MAX_REQUEST_BYTES: limit }).AIRCASTLE_MAX_REQUEST_BYTES).toBe(
      Number(limit),
    );
  });

  test.each(["0", "-1", "1.5", "", "unlimited", "9007199254740992"])(
    "rejects request byte limit %s",
    (limit) => {
      expect(() => readConfig({ AIRCASTLE_MAX_REQUEST_BYTES: limit })).toThrow(
        "AIRCASTLE_MAX_REQUEST_BYTES",
      );
    },
  );

  test("rejects unknown log levels", () => {
    expect(() => readConfig({ AIRCASTLE_LOG_LEVEL: "verbose" })).toThrow("AIRCASTLE_LOG_LEVEL");
  });

  test.each(["fatal", "error", "warn", "info", "debug", "trace", "silent"])(
    "accepts the %s log level",
    (AIRCASTLE_LOG_LEVEL) => {
      expect(readConfig({ AIRCASTLE_LOG_LEVEL }).AIRCASTLE_LOG_LEVEL).toBe(AIRCASTLE_LOG_LEVEL);
    },
  );
});
