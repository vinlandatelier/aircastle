import { collection, compileSchema, text } from "@aircastle/schema";
import { expect, test } from "vite-plus/test";
import { articles } from "./test-support/fixtures.ts";

test("hand-authored core fixture agrees with the accepted existing schema contract", () => {
  const compiled = compileSchema({
    articles: collection({
      title: text().min(1),
      slug: text().unique(),
      summary: text().optional().nullable(),
      status: text().oneOf(["draft", "published"]).default("draft"),
    }),
  });
  expect(compiled.articles.describe()).toEqual(articles);
  expect(compiled.articles.validate({ title: "Hello", slug: "hello" })).toEqual({
    ok: true,
    data: { title: "Hello", slug: "hello", status: "draft" },
  });
});
