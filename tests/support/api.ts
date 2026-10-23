import * as publicExports from "../../src/index.ts";
import type { CompiledCollection } from "../../src/index.ts";



export interface RuntimeText {
  min(value: number): RuntimeText;
  max(value: number): RuntimeText;
  optional(): RuntimeText;
  nullable(): RuntimeText;
  default(value: string | null): RuntimeText;
  oneOf(values: readonly string[]): RuntimeText;
  email(): RuntimeText;
  url(): RuntimeText;
  unique(): RuntimeText;
  editor(name: string, options?: Readonly<Record<string, unknown>>): RuntimeText;
}

export interface RuntimeApi {
  text(): RuntimeText;
  collection(fields: Readonly<Record<string, RuntimeText>>): unknown;
  compileSchema(collections: Readonly<Record<string, unknown>>): Record<
    string, CompiledCollection<Record<string, unknown>>
  >;
}

export function requireSchemaApi(): RuntimeApi {
  const exports: Record<string, unknown> = publicExports;
  const missing = ["text", "collection", "compileSchema"].filter(
    (name) => typeof exports[name] !== "function",
  );
  if (missing.length) {
    throw new Error(`Schema API setup incomplete. Missing public functions: ${missing.join(", ")}. This is not a validation assertion failure.`);
  }
  return exports as unknown as RuntimeApi;
}

export function compileCollection(api: RuntimeApi, fields: Readonly<Record<string, RuntimeText>>) {
  return api.compileSchema({ articles: api.collection(fields) }).articles!;
}
