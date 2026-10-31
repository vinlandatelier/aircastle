import {
  blocks,
  boolean,
  collection,
  compileSchema,
  date,
  datetime,
  json,
  list,
  number,
  object,
  point,
  reference,
  text,
} from "aircastle-under-test";
import type { InferInput, InferOutput, InferRead, JsonValue } from "aircastle-under-test";
import type { Assert, Equal, IsAny } from "./assert.ts";

const articles = collection({
  status: text().oneOf(["draft", "published"]).default("draft"),
  subtitle: text().optional(),
  title: text(),
  note: text().nullable(),
});
export type Input = InferInput<typeof articles>;
export type Output = InferOutput<typeof articles>;
type Writable<Value> = { -readonly [Key in keyof Value]: Value[Key] };
export type InputIsPrecise = Assert<Equal<IsAny<Input>, false>>;
export type OutputIsPrecise = Assert<Equal<IsAny<Output>, false>>;
export type StatusInput = Assert<Equal<Input["status"], "draft" | "published" | undefined>>;
export type StatusOutput = Assert<Equal<Output["status"], "draft" | "published">>;
export type NullableOutput = Assert<Equal<Output["note"], string | null>>;
export type OptionalInput = Assert<
  Equal<Writable<Pick<Input, "subtitle">>, { subtitle?: string | undefined }>
>;
export type OptionalOutput = Assert<
  Equal<Writable<Pick<Output, "subtitle">>, { subtitle?: string }>
>;
export type CompleteInputDomain = Assert<
  Equal<
    Writable<Input>,
    {
      status?: "draft" | "published" | undefined;
      subtitle?: string | undefined;
      title: string;
      note: string | null;
    }
  >
>;
export type CompleteOutputDomain = Assert<
  Equal<
    Writable<Output>,
    {
      status: "draft" | "published";
      subtitle?: string;
      title: string;
      note: string | null;
    }
  >
>;

const omittedInput: Input = { title: "Hi", note: null };
const explicitInput: Input = { title: "Hi", note: null, status: undefined, subtitle: undefined };
const suppliedInput: Input = { title: "Hi", note: "Note", status: "published", subtitle: "" };
const validOutput: Output = { title: "Hi", note: null, status: "published" };
void [omittedInput, explicitInput, suppliedInput, validOutput];

const ordinaryDefault = collection({ title: text().default("draft") });
export type OrdinaryDefaultDoesNotNarrow = Assert<
  Equal<InferOutput<typeof ordinaryDefault>["title"], string>
>;
const optionalDefault = collection({ title: text().optional().default("draft") });
const defaultOptional = collection({ title: text().default("draft").optional() });
export type OptionalDefaultOutput = Assert<
  Equal<InferOutput<typeof optionalDefault>["title"], string>
>;
export type DefaultOptionalOutput = Assert<
  Equal<InferOutput<typeof defaultOptional>["title"], string>
>;
const optionalDefaultOutput: InferOutput<typeof optionalDefault> = { title: "other" };
void optionalDefaultOutput;
export type OptionalDefaultDocument = InferOutput<typeof optionalDefault>;

const plain = collection({ title: text().oneOf(["a", "b"]) });
const edited = collection({ title: text().oneOf(["a", "b"]).editor("radio") });
export type EditorInputInvariant = Assert<
  Equal<InferInput<typeof plain>, InferInput<typeof edited>>
>;
export type EditorOutputInvariant = Assert<
  Equal<InferOutput<typeof plain>, InferOutput<typeof edited>>
>;

const schema = compileSchema({ articles });
const validation = schema.articles.validate({ title: "Hi", note: null });
if (validation.ok) {
  const precise: Assert<Equal<IsAny<typeof validation.data>, false>> = true;
  const matchesOutput: Assert<Equal<typeof validation.data, Output>> = true;
  const output: Output = validation.data;
  void [precise, matchesOutput, output];
}
schema.articles.validate(Symbol("validate accepts unknown inputs"));

const nullDefault = collection({ title: text().nullable().default(null) });
export type NullDefaultDomain = Assert<
  Equal<InferOutput<typeof nullDefault>["title"], string | null>
>;
const suppliedNullDefault: InferInput<typeof nullDefault> = { title: "Supplied text" };
const suppliedNullDefaultOutput: InferOutput<typeof nullDefault> = { title: "Supplied text" };
void [suppliedNullDefault, suppliedNullDefaultOutput];

/**
 * Removes representation noise (intersections and readonly modifiers) at every depth while keeping
 * optionality, unions and `JsonValue` itself, so equality checks compare the inferred data shape.
 */
export type Plain<Value> =
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

type Point = { lat: number; lng: number };

const kinds = collection({
  count: number(),
  rating: number().int().min(1).max(5).optional(),
  score: number().nullable(),
  weight: number().default(1),
  ratio: number().nullable().default(null),
  featured: boolean(),
  visible: boolean().default(false).editor("switch"),
  archived: boolean().optional().nullable(),
  publishedOn: date(),
  updatedAt: datetime().optional(),
  closesAt: datetime().nullable().default("2026-02-14T09:00Z"),
  data: json(),
  extra: json().optional(),
  settings: json().default({ theme: "dark" }),
  location: point(),
  home: point().default({ lat: 0, lng: 0 }),
  away: point().nullable(),
  author: reference("authors"),
  reviewer: reference("authors").optional().nullable(),
  related: reference(["posts", "pages"]),
  single: reference(["posts"]),
});

export type KindsInput = InferInput<typeof kinds>;
export type KindsOutput = InferOutput<typeof kinds>;
export type KindsRead = InferRead<typeof kinds>;
export type KindsInputIsPrecise = Assert<Equal<IsAny<KindsInput>, false>>;
export type KindsOutputIsPrecise = Assert<Equal<IsAny<KindsOutput>, false>>;
export type KindsReadIsPrecise = Assert<Equal<IsAny<KindsRead>, false>>;

export type KindsInputDomain = Assert<
  Equal<
    Plain<KindsInput>,
    {
      count: number;
      rating?: number | undefined;
      score: number | null;
      weight?: number | undefined;
      ratio?: number | null | undefined;
      featured: boolean;
      visible?: boolean | undefined;
      archived?: boolean | null | undefined;
      publishedOn: string;
      updatedAt?: string | undefined;
      closesAt?: string | null | undefined;
      data: JsonValue;
      extra?: JsonValue | undefined;
      settings?: JsonValue | undefined;
      location: Point;
      home?: Point | undefined;
      away: Point | null;
      author: string;
      reviewer?: string | null | undefined;
      related: { collection: "posts" | "pages"; id: string };
      single: { collection: "posts"; id: string };
    }
  >
>;

type KindsOutputShape = {
  count: number;
  rating?: number;
  score: number | null;
  weight: number;
  ratio: number | null;
  featured: boolean;
  visible: boolean;
  archived?: boolean | null;
  publishedOn: string;
  updatedAt?: string;
  closesAt: string | null;
  data: JsonValue;
  extra?: JsonValue;
  settings: JsonValue;
  location: Point;
  home: Point;
  away: Point | null;
  author: string;
  reviewer?: string | null;
  related: { collection: "posts" | "pages"; id: string };
  single: { collection: "posts"; id: string };
};
export type KindsOutputDomain = Assert<Equal<Plain<KindsOutput>, KindsOutputShape>>;
export type KindsReadDomain = Assert<Equal<Plain<KindsRead>, KindsOutputShape>>;

export type JsonIsJsonValue = Assert<Equal<KindsOutput["data"], JsonValue>>;
export type MultiReferenceCollections = Assert<
  Equal<KindsOutput["related"]["collection"], "posts" | "pages">
>;

const composites = collection({
  tags: list(text()),
  notes: list(text().nullable()).optional(),
  grid: list(list(number())),
  scores: list(number()).nullable().default(null),
  links: list(reference("authors")).default([]),
  rows: list(object({ label: text(), weight: number().default(1), note: text().optional() })),
  maybeRows: list(object({ label: text() }).nullable()),
  seo: object({
    description: text().optional(),
    slug: text().default(""),
    image: object({ alt: text().nullable(), caption: text().optional() }).optional(),
  }),
  meta: object({ count: number() }).optional().nullable(),
  layout: blocks({
    hero: object({ heading: text() }),
    quote: object({ text: text(), by: text().optional() }),
  }),
  sections: list(
    object({
      body: blocks({
        hero: object({ heading: text(), cards: list(object({ title: text() })) }),
        group: object({ inner: blocks({ divider: object({}) }).optional() }),
      }).default([]),
    }),
  ).optional(),
});

export type CompositesInput = InferInput<typeof composites>;
export type CompositesOutput = InferOutput<typeof composites>;
export type CompositesRead = InferRead<typeof composites>;
export type CompositesInputIsPrecise = Assert<Equal<IsAny<CompositesInput>, false>>;
export type CompositesOutputIsPrecise = Assert<Equal<IsAny<CompositesOutput>, false>>;
export type CompositesReadIsPrecise = Assert<Equal<IsAny<CompositesRead>, false>>;

export type CompositesInputDomain = Assert<
  Equal<
    Plain<CompositesInput>,
    {
      tags: string[];
      notes?: (string | null)[] | undefined;
      grid: number[][];
      scores?: number[] | null | undefined;
      links?: string[] | undefined;
      rows: {
        id?: string | undefined;
        label: string;
        weight?: number | undefined;
        note?: string | undefined;
      }[];
      maybeRows: ({ id?: string | undefined; label: string } | null)[];
      seo: {
        description?: string | undefined;
        slug?: string | undefined;
        image?: { alt: string | null; caption?: string | undefined } | undefined;
      };
      meta?: { count: number } | null | undefined;
      layout: (
        | { type: "hero"; id?: string | undefined; heading: string }
        | { type: "quote"; id?: string | undefined; text: string; by?: string | undefined }
      )[];
      sections?:
        | {
            id?: string | undefined;
            body?:
              | (
                  | {
                      type: "hero";
                      id?: string | undefined;
                      heading: string;
                      cards: { id?: string | undefined; title: string }[];
                    }
                  | {
                      type: "group";
                      id?: string | undefined;
                      inner?: { type: "divider"; id?: string | undefined }[] | undefined;
                    }
                )[]
              | undefined;
          }[]
        | undefined;
    }
  >
>;

export type CompositesOutputDomain = Assert<
  Equal<
    Plain<CompositesOutput>,
    {
      tags: string[];
      notes?: (string | null)[];
      grid: number[][];
      scores: number[] | null;
      links: string[];
      rows: { id?: string; label: string; weight: number; note?: string }[];
      maybeRows: ({ id?: string; label: string } | null)[];
      seo: {
        description?: string;
        slug: string;
        image?: { alt: string | null; caption?: string };
      };
      meta?: { count: number } | null;
      layout: (
        | { type: "hero"; id?: string; heading: string }
        | { type: "quote"; id?: string; text: string; by?: string }
      )[];
      sections?: {
        id?: string;
        body: (
          | { type: "hero"; id?: string; heading: string; cards: { id?: string; title: string }[] }
          | { type: "group"; id?: string; inner?: { type: "divider"; id?: string }[] }
        )[];
      }[];
    }
  >
>;

export type CompositesReadDomain = Assert<
  Equal<
    Plain<CompositesRead>,
    {
      tags: string[];
      notes?: (string | null)[];
      grid: number[][];
      scores: number[] | null;
      links: string[];
      rows: { id: string; label: string; weight: number; note?: string }[];
      maybeRows: ({ id: string; label: string } | null)[];
      seo: {
        description?: string;
        slug: string;
        image?: { alt: string | null; caption?: string };
      };
      meta?: { count: number } | null;
      layout: (
        | { type: "hero"; id: string; heading: string }
        | { type: "quote"; id: string; text: string; by?: string }
      )[];
      sections?: {
        id: string;
        body: (
          | { type: "hero"; id: string; heading: string; cards: { id: string; title: string }[] }
          | { type: "group"; id: string; inner?: { type: "divider"; id: string }[] }
        )[];
      }[];
    }
  >
>;

export type BlockType = Assert<Equal<CompositesRead["layout"][number]["type"], "hero" | "quote">>;
export type ReadBlockId = Assert<Equal<CompositesRead["layout"][number]["id"], string>>;
export type ReadRowId = Assert<Equal<CompositesRead["rows"][number]["id"], string>>;
export type ListOfScalarsHasNoId = Assert<Equal<CompositesRead["tags"], string[]>>;

const defaultedComposites = collection({
  rows: list(object({ label: text(), weight: number().default(1) })).default([{ label: "a" }]),
  layout: blocks({ hero: object({ heading: text(), by: text().default("anonymous") }) }).default([
    { type: "hero", heading: "Hi" },
  ]),
  seo: object({ title: text(), slug: text().default("") }).default({ title: "Home" }),
  point: point().nullable().default(null),
  data: json().nullable().default(null),
  flag: boolean().nullable().default(null),
  day: date().nullable().default(null),
});
export type DefaultedCompositesOutput = Assert<
  Equal<
    Plain<InferOutput<typeof defaultedComposites>>,
    {
      rows: { id?: string; label: string; weight: number }[];
      layout: { type: "hero"; id?: string; heading: string; by: string }[];
      seo: { title: string; slug: string };
      point: Point | null;
      data: JsonValue;
      flag: boolean | null;
      day: string | null;
    }
  >
>;

const rowInput: CompositesInput["rows"][number] = { label: "a" };
const rowInputWithId: CompositesInput["rows"][number] = { id: "r1", label: "a" };
const blockInput: CompositesInput["layout"][number] = { type: "quote", text: "Hi" };
const blockOutput: CompositesOutput["layout"][number] = { type: "hero", heading: "Hi" };
const blockRead: CompositesRead["layout"][number] = { type: "hero", id: "b1", heading: "Hi" };
const multiReference: KindsInput["related"] = { collection: "pages", id: "p1" };
void [rowInput, rowInputWithId, blockInput, blockOutput, blockRead, multiReference];

const fieldSchema = compileSchema({
  kinds,
  composites,
  authors: collection({}),
  posts: collection({}),
  pages: collection({}),
});
const fieldValidation = fieldSchema.composites.validate({});
if (fieldValidation.ok) {
  const precise: Assert<Equal<IsAny<typeof fieldValidation.data>, false>> = true;
  const matchesOutput: Assert<Equal<typeof fieldValidation.data, CompositesOutput>> = true;
  void [precise, matchesOutput];
}
