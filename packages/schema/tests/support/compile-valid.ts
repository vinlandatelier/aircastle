import { expect } from "vite-plus/test";
import { compileCollection, type FieldDeclaration } from "./collections.ts";

/** Compiles a declaration the spec accepts, turning an unexpected SchemaError into an assertion failure that lists its issues. */
export function compileValid(fields: Readonly<Record<string, FieldDeclaration>>) {
  let compiled: ReturnType<typeof compileCollection> | undefined;
  let issues: unknown = [];
  try {
    compiled = compileCollection(fields);
  } catch (error) {
    issues = (error as { issues?: unknown }).issues ?? error;
  }
  expect(issues).toEqual([]);
  return compiled!;
}
