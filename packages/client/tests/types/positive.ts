import type { AircastleClient } from "aircastle-client-under-test";
import { aircastle, config, type Article, type CreateInput, type CreateResult } from "./config.ts";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false;
type Expect<Value extends true> = Value;
type Expand<Value> = { [Key in keyof Value]: Value[Key] };
export type InputContract = Expect<
  Equal<
    Expand<CreateInput>,
    {
      title: string;
      slug: string;
      subtitle: string | null;
      summary?: string | undefined;
      status?: "draft" | "published" | undefined;
    }
  >
>;
export type OutputContract = Expect<
  Equal<
    Expand<Article>,
    {
      id: string;
      title: string;
      slug: string;
      subtitle: string | null;
      summary?: string;
      status: "draft" | "published";
    }
  >
>;
export type CollectionNames = Expect<
  Equal<keyof AircastleClient<typeof config.collections>, "articles" | "authors">
>;
export type ReadMatchesCreate = Expect<
  Equal<Awaited<ReturnType<typeof aircastle.articles.findById>>, CreateResult>
>;

export const minimalInput: CreateInput = { title: "Hello", slug: "hello", subtitle: null };
export const explicitOptional: CreateInput = {
  ...minimalInput,
  summary: undefined,
  status: undefined,
};
export const saved: Article = {
  id: "generated",
  title: "Hello",
  slug: "hello",
  subtitle: null,
  status: "draft",
};

export function narrowResult(result: CreateResult): void {
  if (result.ok) {
    const status: "draft" | "published" = result.data.status;
    const summary: string | undefined = result.data.summary;
    void [status, summary];
  } else if (result.error.code === "unique_conflict") {
    const field: string = result.error.field;
    void field;
  } else if (result.error.code === "validation_failed") {
    const first = result.error.issues[0];
    const path: readonly (string | number)[] = first.path;
    void path;
  }
}

const documentId = "33333333-3333-4333-8333-333333333333";
export type UpdateResult = Awaited<ReturnType<typeof aircastle.articles.update>>;
export type DeleteResult = Awaited<ReturnType<typeof aircastle.articles.delete>>;
export type ListResult = Awaited<ReturnType<typeof aircastle.articles.list>>;
export type UpdateMatchesRead = Expect<Equal<UpdateResult, CreateResult>>;
export type DeleteData = Expect<Equal<Extract<DeleteResult, { ok: true }>["data"], { id: string }>>;
export type ListPage = Expect<
  Equal<
    Expand<Extract<ListResult, { ok: true }>["data"]>,
    { documents: Article[]; next: string | null }
  >
>;

export const updates = [
  aircastle.articles.update(documentId, { title: "Hello again" }),
  aircastle.articles.update(documentId, { title: "X" }, { unset: ["summary", "status"] }),
  aircastle.articles.update(documentId, { summary: undefined, subtitle: null }),
  aircastle.articles.update(documentId, {}),
];
export const deleted = aircastle.articles.delete(documentId);
export const lists = [
  aircastle.articles.list(),
  aircastle.articles.list({}),
  aircastle.articles.list({
    where: {
      status: "published",
      title: { contains: "launch", not: "Draft" },
      subtitle: { empty: true },
      slug: { in: ["a", "b"] },
      summary: { is: "Short", empty: false },
    },
    sort: "-title",
    limit: 20,
    cursor: "opaque",
  }),
  aircastle.articles.list({ where: { status: { in: ["draft", "published"] } }, sort: "slug" }),
];

export function narrowUpdate(result: UpdateResult): void {
  if (result.ok) {
    const status: "draft" | "published" = result.data.status;
    void status;
  } else if (result.error.code === "unique_conflict") {
    const field: string = result.error.field;
    void field;
  } else if (result.error.code === "validation_failed") {
    const path: readonly (string | number)[] = result.error.issues[0].path;
    void path;
  }
}

export function narrowDelete(result: DeleteResult): void {
  if (result.ok) {
    const id: string = result.data.id;
    void id;
  } else if (result.error.code === "referenced") {
    const collection: string = result.error.collection;
    const field: string = result.error.field;
    void [collection, field];
  }
}

export function narrowList(result: ListResult): void {
  if (result.ok) {
    const first: Article | undefined = result.data.documents[0];
    const next: string | null = result.data.next;
    void [first, next];
  } else if (result.error.code === "invalid_request") {
    const code: "invalid_request" = result.error.code;
    void code;
  }
}
