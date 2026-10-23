import type { Fetch } from "@aircastle/contracts";
import { collection, compileSchema, text } from "@aircastle/schema";
import { describe, expect, test, vi } from "vite-plus/test";
import { ConfigurationError, createClient, defineConfig } from "./index.ts";

const project = "11111111-1111-4111-8111-111111111111";
const connection = { url: "https://cms.example.com", project };

function expectSettingFailure(operation: () => unknown, setting: string) {
  try {
    operation();
    throw new Error("Expected configuration failure");
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigurationError);
    expect(error).toMatchObject({ name: "ConfigurationError", setting });
  }
}

describe("developer configuration", () => {
  test("retains a valid project config without constructing network resources", () => {
    const articles = collection({ title: text().min(1) });
    const config = defineConfig({ ...connection, collections: { articles } });
    expect(config.project).toBe(project);
    expect(new URL(config.url).origin).toBe(connection.url);
    expect(compileSchema(config.collections).articles.validate({ title: "Hello" })).toEqual({
      ok: true,
      data: { title: "Hello" },
    });
    const transport = vi.fn<Fetch>();
    const client = createClient({ ...config, apiKey: "test-secret", fetch: transport });
    expect(typeof client.articles.create).toBe("function");
    expect(typeof client.articles.findById).toBe("function");
    expect(transport).not.toHaveBeenCalled();
    expect(client).not.toHaveProperty("close");
    expect(client).not.toHaveProperty("publishSchema");
    expect(client).not.toHaveProperty("collections");
  });

  test.each([
    undefined,
    "",
    "not a URL",
    "file:///tmp/cms",
    "https://user:secret@cms.example.com",
    "https://cms.example.com?token=secret",
    "https://cms.example.com#fragment",
  ])("rejects invalid URL %s before I/O", (url) => {
    expectSettingFailure(() => defineConfig({ url, project, collections: {} }), "url");
  });

  test.each([undefined, "", "not-a-project-uuid"])("rejects invalid project %s", (invalid) => {
    expectSettingFailure(
      () => defineConfig({ url: connection.url, project: invalid, collections: {} }),
      "project",
    );
  });

  test.each([undefined, ""])("rejects missing API key %s before I/O", (apiKey) => {
    const transport = vi.fn<Fetch>();
    expectSettingFailure(
      () => createClient({ ...connection, collections: {}, apiKey, fetch: transport }),
      "apiKey",
    );
    expect(transport).not.toHaveBeenCalled();
  });

  test.each([
    "then",
    "close",
    "constructor",
    "prototype",
    "__proto__",
    "toJSON",
    "article-posts",
    "1articles",
    "",
    "文章",
  ])("rejects collection name %s", (name) => {
    const collections = Object.fromEntries([[name, collection({ title: text() })]]);
    expect(() => defineConfig({ ...connection, collections })).toThrow(ConfigurationError);
  });

  test.each(["id", "display title", "1title", "", "标题"])("rejects field name %s", (name) => {
    const articles = collection(Object.fromEntries([[name, text()]]));
    expect(() => defineConfig({ ...connection, collections: { articles } })).toThrow(
      ConfigurationError,
    );
  });

  test("permits the legal collection name toString", () => {
    const config = defineConfig({
      ...connection,
      collections: { toString: collection({ title: text() }) },
    });
    expect(Object.hasOwn(config.collections, "toString")).toBe(true);
    expect(compileSchema(config.collections).toString.validate({ title: "Hello" })).toEqual({
      ok: true,
      data: { title: "Hello" },
    });
  });

  test("permits legal prototype-like field names without prototype lookup", () => {
    const articles = collection(
      Object.fromEntries([
        ["constructor", text()],
        ["__proto__", text()],
      ]),
    );
    const config = defineConfig({ ...connection, collections: { articles } });
    const document = Object.fromEntries([
      ["constructor", "Ctor"],
      ["__proto__", "Proto"],
    ]);
    expect(compileSchema(config.collections).articles.validate(document)).toEqual({
      ok: true,
      data: document,
    });
  });

  test("invalid field declarations retain SchemaError issues", () => {
    try {
      defineConfig({
        ...connection,
        collections: { articles: collection({ title: text().min(-1) }) },
      });
      throw new Error("Expected schema declaration failure");
    } catch (error) {
      expect(error).toMatchObject({
        name: "SchemaError",
        issues: [{ code: "invalid_bound", constraint: "min", path: ["articles", "title"] }],
      });
    }
  });

  test("snapshotting config protects a constructed contract from caller mutation", () => {
    const original = collection({ title: text().min(1) });
    const collections = { articles: original };
    const config = defineConfig({ ...connection, collections });
    collections.articles = collection({ title: text().min(5) });
    expect(compileSchema(config.collections).articles.validate({ title: "Hi" })).toEqual({
      ok: true,
      data: { title: "Hi" },
    });
  });
});
