import { describe, expect, expectTypeOf, test } from "vite-plus/test";
import { readConfig } from "./config.ts";

describe("API configuration", () => {
  test("supplies development defaults without requiring a database", () => {
    expect(readConfig({})).toEqual({
      PORT: 43122,
      NODE_ENV: "development",
      LOG_LEVEL: "info",
    });
  });

  test("parses configured values and ignores unrelated environment variables", () => {
    const config = readConfig({
      PORT: "43130",
      NODE_ENV: "production",
      LOG_LEVEL: "warn",
      UNRELATED: "ignored",
    });

    expect(config).toEqual({ PORT: 43130, NODE_ENV: "production", LOG_LEVEL: "warn" });
    expectTypeOf(config.PORT).toEqualTypeOf<number>();
    expectTypeOf(config.NODE_ENV).toEqualTypeOf<"development" | "production" | "test">();
  });

  test.each(["1", "65535"])("accepts valid port boundary %s", (PORT) => {
    expect(readConfig({ PORT }).PORT).toBe(Number(PORT));
  });

  test.each(["0", "-1", "65536", "43122.5", "not-a-port", ""])(
    "rejects invalid port %s",
    (PORT) => {
      expect(() => readConfig({ PORT })).toThrow();
    },
  );

  test("rejects unknown environments and log levels", () => {
    expect(() => readConfig({ NODE_ENV: "prod" })).toThrow();
    expect(() => readConfig({ LOG_LEVEL: "verbose" })).toThrow();
  });

  test.each(["fatal", "error", "warn", "info", "debug", "trace", "silent"])(
    "accepts the %s log level",
    (LOG_LEVEL) => {
      expect(readConfig({ LOG_LEVEL }).LOG_LEVEL).toBe(LOG_LEVEL);
    },
  );
});
