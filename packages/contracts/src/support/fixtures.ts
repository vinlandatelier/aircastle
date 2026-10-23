import type { CollectionDescription, TextFieldDescription } from "@aircastle/schema";

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
