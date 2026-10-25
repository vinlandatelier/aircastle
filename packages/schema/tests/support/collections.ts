import { collection, compileSchema, type text } from "../../src/index.ts";

export type TextBuilder = ReturnType<typeof text>;
export type FieldDeclaration = Parameters<typeof collection>[0][string];

export function compileCollection(fields: Readonly<Record<string, FieldDeclaration>>) {
  return compileSchema({ articles: collection(fields) }).articles;
}
