import { describe, expect, test } from "vite-plus/test";
import { readPostgresOptions } from "./index.ts";

describe("Postgres environment configuration", () => {
  test("uses the local Compose defaults without a URL", () => {
    expect(readPostgresOptions({})).toEqual({
      url: "postgresql://aircastle:aircastle-local@127.0.0.1:43123/aircastle",
    });
  });

  test("builds the connection from all granular settings and keeps its namespace", () => {
    expect(
      readPostgresOptions({
        AIRCASTLE_DB_HOST: "database.internal",
        AIRCASTLE_DB_PORT: "5544",
        AIRCASTLE_DB_NAME: "editorial",
        AIRCASTLE_DB_USER: "editor",
        AIRCASTLE_DB_PASSWORD: "secret",
        AIRCASTLE_DATABASE_NAMESPACE: "cms",
      }),
    ).toEqual({
      url: "postgresql://editor:secret@database.internal:5544/editorial",
      namespace: "cms",
    });
  });

  test("encodes credentials and database names without changing their meaning", () => {
    const parsed = new URL(
      readPostgresOptions({
        AIRCASTLE_DB_USER: "user@team:one",
        AIRCASTLE_DB_PASSWORD: "p@ss:/?#%雪",
        AIRCASTLE_DB_NAME: "content/archive ?#%雪",
      }).url,
    );
    expect(decodeURIComponent(parsed.username)).toBe("user@team:one");
    expect(decodeURIComponent(parsed.password)).toBe("p@ss:/?#%雪");
    expect(decodeURIComponent(parsed.pathname.slice(1))).toBe("content/archive ?#%雪");
    expect(parsed.hostname).toBe("127.0.0.1");
    expect(parsed.search).toBe("");
    expect(parsed.hash).toBe("");
  });

  test.each(["::1", "[::1]"])("accepts IPv6 host %s", (host) => {
    expect(new URL(readPostgresOptions({ AIRCASTLE_DB_HOST: host }).url).hostname).toBe("[::1]");
  });

  test.each(["1", "65535"])("accepts port boundary %s", (port) => {
    expect(new URL(readPostgresOptions({ AIRCASTLE_DB_PORT: port }).url).port).toBe(port);
  });

  test("lets the full URL override even invalid granular settings", () => {
    const url = "postgresql://remote:password@db.example:6543/live?sslmode=require";
    expect(
      readPostgresOptions({
        AIRCASTLE_DATABASE_URL: url,
        AIRCASTLE_DB_HOST: "invalid/host",
        AIRCASTLE_DB_PORT: "bad",
        AIRCASTLE_DB_USER: "",
        AIRCASTLE_DB_NAME: "",
        AIRCASTLE_DB_PASSWORD: "ignored",
      }),
    ).toEqual({ url });
  });

  test("allows an explicitly empty password", () => {
    expect(new URL(readPostgresOptions({ AIRCASTLE_DB_PASSWORD: "" }).url).password).toBe("");
  });

  test.each(["", "0", "-1", "65536", "5432.5", "bad", " 5432"])(
    "rejects invalid port %j",
    (port) => {
      expect(() => readPostgresOptions({ AIRCASTLE_DB_PORT: port })).toThrow("AIRCASTLE_DB_PORT");
    },
  );

  test.each([
    "",
    "http://localhost",
    "host/database",
    "user@host",
    "host?x=1",
    "host#x",
    "host:5432",
    "host name",
    "host\\name",
  ])("rejects invalid host %j", (host) => {
    expect(() => readPostgresOptions({ AIRCASTLE_DB_HOST: host })).toThrow("AIRCASTLE_DB_HOST");
  });

  test.each(["AIRCASTLE_DB_USER", "AIRCASTLE_DB_NAME"])("rejects empty %s", (name) => {
    expect(() => readPostgresOptions({ [name]: "" })).toThrow(name);
  });

  test.each(["AIRCASTLE_DB_USER", "AIRCASTLE_DB_NAME", "AIRCASTLE_DB_PASSWORD"])(
    "rejects null bytes in %s without disclosing the value",
    (name) => {
      const secret = "private\0value";
      expect(() => readPostgresOptions({ [name]: secret })).toThrow(name);
      expect(() => readPostgresOptions({ [name]: secret })).not.toThrow(secret);
    },
  );

  test.each(["", "not-a-url", "https://host/database", "postgresql://host/database#fragment"])(
    "rejects invalid explicit URL %j without falling back",
    (url) => {
      expect(() => readPostgresOptions({ AIRCASTLE_DATABASE_URL: url })).toThrow(
        "AIRCASTLE_DATABASE_URL",
      );
    },
  );
});
