import {
  blocks,
  boolean,
  collection,
  date,
  datetime,
  json,
  list,
  number,
  object,
  point,
  reference,
  text,
} from "@aircastle/schema";
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

export const fieldConfig = defineConfig({
  url: "https://cms.example.com",
  project: "11111111-1111-4111-8111-111111111111",
  collections: {
    pages: collection({
      rating: number().int().min(1).max(5),
      featured: boolean().default(false),
      publishedOn: date().optional(),
      updatedAt: datetime().nullable(),
      data: json(),
      location: point().optional(),
      author: reference("authors"),
      related: reference(["posts", "authors"]).optional(),
      tags: list(text()),
      rows: list(object({ label: text(), weight: number().default(1) })),
      seo: object({ description: text().optional(), slug: text().default("") }),
      layout: blocks({
        hero: object({ heading: text() }),
        group: object({
          cards: list(object({ title: text() })),
          inner: blocks({ divider: object({}) }),
        }),
      }),
    }),
    authors: collection({ name: text() }),
    posts: collection({ title: text() }),
  },
});

export const fieldClient = createClient({ ...fieldConfig, apiKey: "server-secret" });
export type PageInput = Parameters<typeof fieldClient.pages.create>[0];
export type PageResult = Awaited<ReturnType<typeof fieldClient.pages.create>>;
export type Page = Extract<PageResult, { ok: true }>["data"];
export type PageBlock = Page["layout"][number];
