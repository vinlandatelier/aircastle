import { collection, compileSchema, text } from "aircastle-under-test";
import type { InferInput, InferOutput } from "aircastle-under-test";
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
export type OptionalInput = Assert<Equal<Writable<Pick<Input, "subtitle">>, { subtitle?: string | undefined }>>;
export type OptionalOutput = Assert<Equal<Writable<Pick<Output, "subtitle">>, { subtitle?: string }>>;
export type CompleteInputDomain = Assert<Equal<Writable<Input>, {
  status?: "draft" | "published" | undefined;
  subtitle?: string | undefined;
  title: string;
  note: string | null;
}>>;
export type CompleteOutputDomain = Assert<Equal<Writable<Output>, {
  status: "draft" | "published";
  subtitle?: string;
  title: string;
  note: string | null;
}>>;

const omittedInput: Input = { title: "Hi", note: null };
const explicitInput: Input = { title: "Hi", note: null, status: undefined, subtitle: undefined };
const suppliedInput: Input = { title: "Hi", note: "Note", status: "published", subtitle: "" };
const validOutput: Output = { title: "Hi", note: null, status: "published" };
void [omittedInput, explicitInput, suppliedInput, validOutput];

const ordinaryDefault = collection({ title: text().default("draft") });
export type OrdinaryDefaultDoesNotNarrow = Assert<Equal<InferOutput<typeof ordinaryDefault>["title"], string>>;
const optionalDefault = collection({ title: text().optional().default("draft") });
const defaultOptional = collection({ title: text().default("draft").optional() });
export type OptionalDefaultOutput = Assert<Equal<InferOutput<typeof optionalDefault>["title"], string>>;
export type DefaultOptionalOutput = Assert<Equal<InferOutput<typeof defaultOptional>["title"], string>>;
const optionalDefaultOutput: InferOutput<typeof optionalDefault> = { title: "other" };
void optionalDefaultOutput;
export type OptionalDefaultDocument = InferOutput<typeof optionalDefault>;

const plain = collection({ title: text().oneOf(["a", "b"]) });
const edited = collection({ title: text().oneOf(["a", "b"]).editor("radio") });
export type EditorInputInvariant = Assert<Equal<InferInput<typeof plain>, InferInput<typeof edited>>>;
export type EditorOutputInvariant = Assert<Equal<InferOutput<typeof plain>, InferOutput<typeof edited>>>;

const schema = compileSchema({ articles });
const validation = schema.articles.validate({ title: "Hi", note: null });
if (validation.ok) {
  const precise: Assert<Equal<IsAny<typeof validation.data>, false>> = true;
  const matchesOutput: Assert<Equal<typeof validation.data, Output>> = true;
  const output: Output = validation.data;
  void [precise, matchesOutput, output];
}
schema.articles.validate(Symbol("validate accepts unknown inputs"));

text().nullable().default(null);
