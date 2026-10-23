import { collection, text } from "@aircastle/schema";
import { createClient, defineConfig } from "aircastle-client-under-test";

export const config = defineConfig({
  url: "https://cms.example.com",
  project: "11111111-1111-4111-8111-111111111111",
  collections: {
    articles: collection({
      title: text(),
      slug: text().unique(),
      subtitle: text().nullable(),
      summary: text().optional(),
      status: text().oneOf(["draft", "published"]).default("draft"),
    }),
    authors: collection({ name: text() }),
  },
});

export const aircastle = createClient({ ...config, apiKey: "server-secret" });
export type CreateInput = Parameters<typeof aircastle.articles.create>[0];
export type CreateResult = Awaited<ReturnType<typeof aircastle.articles.create>>;
export type Article = Extract<CreateResult, { ok: true }>["data"];
