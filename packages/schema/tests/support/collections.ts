import { expect } from "vite-plus/test";
import {
  collection,
  compileSchema,
  type CollectionDescription,
  type text,
  type TextFieldDescription,
} from "../../src/index.ts";

export type TextBuilder = ReturnType<typeof text>;
export type FieldDeclaration = Parameters<typeof collection>[0][string];

export function compileCollection(fields: Readonly<Record<string, FieldDeclaration>>) {
  return compileSchema({ articles: collection(fields) }).articles;
}

/** Narrows a described field to text, failing the test when it has another kind. */
export function textField(description: CollectionDescription, name: string): TextFieldDescription {
  const field = description.fields[name];
  expect(field?.type).toBe("text");
  return field as TextFieldDescription;
}
