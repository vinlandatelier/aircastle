import type { CollectionDescription, TextFieldDescription } from "@aircastle/schema";
import { expect } from "vite-plus/test";
import { decodeCollections } from "../decode.ts";
import { parseCollections } from "../index.ts";

export function field(overrides: Partial<TextFieldDescription> = {}): TextFieldDescription {
  return { type: "text", required: true, nullable: false, unique: false, ...overrides };
}

export function description(
  fields: Record<string, TextFieldDescription> = { title: field() },
): CollectionDescription {
  return { fields };
}

export const articleDescription: CollectionDescription = {
  fields: {
    title: { type: "text", required: true, nullable: false, unique: false, min: 1 },
    slug: { type: "text", required: true, nullable: false, unique: true },
    summary: { type: "text", required: false, nullable: false, unique: false },
    status: {
      type: "text",
      required: false,
      nullable: false,
      unique: false,
      choices: ["draft", "published"],
      default: "draft",
    },
  },
};

export function freezeDeep<Value>(value: Value): Value {
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

/** Asserts that input is publicly an invalid request and returns the decoder's reason, with schema issues reduced to their codes and paths. */
export function rejection(input: unknown): unknown {
  expect(parseCollections(input)).toEqual({ ok: false, error: { code: "invalid_request" } });
  const decoded = decodeCollections(input);
  if (decoded.ok || decoded.issue.reason !== "invalid_schema")
    return decoded.ok ? decoded : decoded.issue;
  return {
    reason: "invalid_schema",
    issues: decoded.issue.issues.map(({ code, path }) => ({ code, path })),
  };
}

/** The `rejection` summary for one schema issue on a field of the decoded collection. */
export function schemaRejection(code: string, name = "title") {
  return { reason: "invalid_schema", issues: [{ code, path: ["wire", name] }] };
}
