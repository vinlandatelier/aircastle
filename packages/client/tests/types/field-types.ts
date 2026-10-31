import {
  blocks,
  boolean,
  collection,
  datetime,
  list,
  number,
  object,
  point,
  reference,
  text,
  type InferInput,
  type JsonValue,
} from "@aircastle/schema";
import { createClient, defineConfig } from "aircastle-client-under-test";
import {
  fieldClient,
  type Page,
  type PageBlock,
  type PageInput,
  type PageResult,
} from "./config.ts";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false;
type Expect<Value extends true> = Value;

const pages = collection({
  layout: blocks({
    hero: object({ heading: text() }),
    quote: object({ text: text() }),
  }),
  rows: list(object({ a: text() })),
  panel: object({ content: blocks({ note: object({ body: text() }) }) }),
  author: reference("authors"),
  coauthors: list(reference("authors")).optional(),
  subject: reference(["authors"]),
  location: point(),
  count: number().int(),
  flag: boolean(),
  at: datetime(),
});
const authors = collection({ name: text() });

const config = defineConfig({
  url: "https://cms.example.com",
  project: "11111111-1111-4111-8111-111111111111",
  collections: { authors, pages },
});
const aircastle = createClient({ ...config, apiKey: "server-secret" });

type Read = Extract<Awaited<ReturnType<typeof aircastle.pages.findById>>, { ok: true }>["data"];
type Created = Extract<Awaited<ReturnType<typeof aircastle.pages.create>>, { ok: true }>["data"];
type Input = Parameters<typeof aircastle.pages.create>[0];

export type FieldTypeContracts = [
  Expect<Equal<Input, InferInput<typeof pages>>>,
  Expect<Equal<Read["layout"][number]["id"], string>>,
  Expect<Equal<Read["rows"][number], { a: string; id: string }>>,
  Expect<Equal<Read["panel"]["content"][number], { type: "note"; id: string; body: string }>>,
  Expect<Equal<Created["layout"][number]["id"], string>>,
  Expect<Equal<Created["rows"][number], { a: string; id: string }>>,
  Expect<Equal<Read["author"], string>>,
  Expect<Equal<Read["coauthors"], string[] | undefined>>,
  Expect<Equal<Read["subject"], { collection: "authors"; id: string }>>,
  Expect<Equal<Read["location"], { lat: number; lng: number }>>,
  Expect<Equal<Read["count"], number>>,
  Expect<Equal<Read["flag"], boolean>>,
  Expect<Equal<Read["at"], string>>,
  Expect<Equal<Read["id"], string>>,
];

export const input: Input = {
  layout: [
    { type: "hero", heading: "Hi" },
    { type: "quote", text: "Kept", id: "b1" },
  ],
  rows: [{ a: "x" }, { a: "y", id: "r1" }],
  panel: { content: [] },
  author: "a1000000-0000-4000-8000-000000000001",
  subject: { collection: "authors", id: "a1000000-0000-4000-8000-000000000001" },
  location: { lat: -33.86, lng: 151.21 },
  count: 3,
  flag: false,
  at: "2026-02-14T09:00+11:00",
};

type Plain<Value> =
  IsJsonValue<Exclude<Value, undefined>> extends true ? Value : PlainMembers<Value>;
type IsJsonValue<Value> = [Value] extends [JsonValue]
  ? [JsonValue] extends [Value]
    ? true
    : false
  : false;
type PlainMembers<Value> = Value extends readonly (infer Item)[]
  ? Plain<Item>[]
  : Value extends object
    ? { -readonly [Key in keyof Value]: Plain<Value[Key]> }
    : Value;
type IsAny<Value> = 0 extends 1 & Value ? true : false;
type Point = { lat: number; lng: number };

export type PageInputIsPrecise = Expect<Equal<IsAny<PageInput>, false>>;
export type PageIsPrecise = Expect<Equal<IsAny<Page>, false>>;
export type PageInputContract = Expect<
  Equal<
    Plain<PageInput>,
    {
      rating: number;
      featured?: boolean | undefined;
      publishedOn?: string | undefined;
      updatedAt: string | null;
      data: JsonValue;
      location?: Point | undefined;
      author: string;
      related?: { collection: "posts" | "authors"; id: string } | undefined;
      tags: string[];
      rows: { id?: string | undefined; label: string; weight?: number | undefined }[];
      seo: { description?: string | undefined; slug?: string | undefined };
      layout: (
        | { type: "hero"; id?: string | undefined; heading: string }
        | {
            type: "group";
            id?: string | undefined;
            cards: { id?: string | undefined; title: string }[];
            inner: { type: "divider"; id?: string | undefined }[];
          }
      )[];
    }
  >
>;
export type PageReadContract = Expect<
  Equal<
    Plain<Page>,
    {
      id: string;
      rating: number;
      featured: boolean;
      publishedOn?: string;
      updatedAt: string | null;
      data: JsonValue;
      location?: Point;
      author: string;
      related?: { collection: "posts" | "authors"; id: string };
      tags: string[];
      rows: { id: string; label: string; weight: number }[];
      seo: { description?: string; slug: string };
      layout: (
        | { type: "hero"; id: string; heading: string }
        | {
            type: "group";
            id: string;
            cards: { id: string; title: string }[];
            inner: { type: "divider"; id: string }[];
          }
      )[];
    }
  >
>;
export type PageReadMatchesCreate = Expect<
  Equal<Awaited<ReturnType<typeof fieldClient.pages.findById>>, PageResult>
>;
export type ReadBlockIdIsString = Expect<Equal<PageBlock["id"], string>>;

export const pageInput: PageInput = {
  rating: 4,
  updatedAt: "2026-02-14T09:00+11:00",
  data: { a: [1, "x", true, null] },
  author: "a_123",
  tags: ["news"],
  rows: [{ label: "a" }, { id: "r1", label: "b", weight: 2 }],
  seo: {},
  layout: [
    { type: "hero", heading: "Hi" },
    { type: "group", id: "b1", cards: [{ title: "Card" }], inner: [{ type: "divider" }] },
  ],
};

export function readIds(result: PageResult): string[] {
  if (!result.ok) return [];
  const ids: string[] = [result.data.id];
  for (const row of result.data.rows) ids.push(row.id);
  for (const block of result.data.layout) {
    ids.push(block.id);
    if (block.type === "group") {
      for (const card of block.cards) ids.push(card.id);
      for (const divider of block.inner) ids.push(divider.id);
    }
  }
  return ids;
}
