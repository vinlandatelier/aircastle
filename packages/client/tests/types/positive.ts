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
