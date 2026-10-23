import { collection, compileSchema, text } from "../../src/index.ts";
import type { InferInput, InferOutput } from "../../src/index.ts";
import type { Assert, Equal, IsAny } from "./assert.ts";

// Deliberately imports the actual future API. No test-only runtime interface or
// cast may stand in for production type inference. Missing exports are setup red.
const articles = collection({
  status: text().oneOf(["draft", "published"]).default("draft"),
  subtitle: text().optional(),
  title: text(),
  note: text().nullable(),
});
type Input = InferInput<typeof articles>;
type Output = InferOutput<typeof articles>;
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
// @ts-expect-error Successful output must contain the defaulted status.
const missingStatus: Output = { title: "Hi", note: null };
// @ts-expect-error Successful optional output cannot contain explicit undefined.
const undefinedOutput: Output = { title: "Hi", note: null, status: "draft", subtitle: undefined };
// @ts-expect-error Choices retain their literal domain.
const invalidChoice: Input = { title: "Hi", note: null, status: "other" };
// @ts-expect-error Nullable does not mean optional.
const missingNullable: Input = { title: "Hi" };
// @ts-expect-error Primitive text does not accept numbers.
const coercedInput: Input = { title: 7, note: null };
void [missingStatus, undefinedOutput, invalidChoice, missingNullable, coercedInput];

const ordinaryDefault = collection({ title: text().default("draft") });
export type OrdinaryDefaultDoesNotNarrow = Assert<Equal<InferOutput<typeof ordinaryDefault>["title"], string>>;
const optionalDefault = collection({ title: text().optional().default("draft") });
const defaultOptional = collection({ title: text().default("draft").optional() });
export type OptionalDefaultOutput = Assert<Equal<InferOutput<typeof optionalDefault>["title"], string>>;
export type DefaultOptionalOutput = Assert<Equal<InferOutput<typeof defaultOptional>["title"], string>>;
const optionalDefaultOutput: InferOutput<typeof optionalDefault> = { title: "other" };
// @ts-expect-error Optional plus default still guarantees output presence.
const absentOptionalDefault: InferOutput<typeof optionalDefault> = {};
void [optionalDefaultOutput, absentOptionalDefault];

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
// @ts-expect-error Unknown collections are not inferred.
schema.pages;

text().nullable().default(null);
// @ts-expect-error Nullable must precede a null default in the typed builder.
text().default(null);
// @ts-expect-error Undefined is not a literal default.
text().default(undefined);
// @ts-expect-error Function defaults are outside the accepted API.
text().default(() => "draft");
