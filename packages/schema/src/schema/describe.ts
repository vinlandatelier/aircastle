import type {
  CollectionDescription,
  FieldDescription,
  ObjectFieldDescription,
} from "./contract.ts";
import type { CompiledField, FieldEntries } from "./fields.ts";

function describeEntries(fields: FieldEntries): Record<string, FieldDescription> {
  return Object.fromEntries(fields.map(([name, field]) => [name, describeField(field)]));
}

function describeRequired(field: CompiledField): FieldDescription {
  return { ...describeField(field), required: true };
}

/** Builds fresh plain data for one compiled field, so callers can never reach compiled state. */
export function describeField(field: CompiledField): FieldDescription {
  const presence = {
    required: !field.optional && !field.hasDefault,
    nullable: field.nullable,
  };
  const defaulted = field.hasDefault ? { default: structuredClone(field.default) } : {};
  const { rules } = field;
  switch (rules.kind) {
    case "text":
      return {
        type: "text",
        ...presence,
        unique: rules.unique,
        ...(rules.min === undefined ? {} : { min: rules.min }),
        ...(rules.max === undefined ? {} : { max: rules.max }),
        ...(rules.format === undefined ? {} : { format: rules.format }),
        ...(rules.choices === undefined ? {} : { choices: [...rules.choices] }),
        ...defaulted,
        ...(rules.editor === undefined ? {} : { editor: { ...rules.editor } }),
      } as FieldDescription;
    case "number":
      return {
        type: "number",
        ...presence,
        integer: rules.integer,
        ...(rules.min === undefined ? {} : { min: rules.min }),
        ...(rules.max === undefined ? {} : { max: rules.max }),
        ...defaulted,
      } as FieldDescription;
    case "boolean":
      return {
        type: "boolean",
        ...presence,
        ...defaulted,
        ...(rules.editor === undefined ? {} : { editor: { type: rules.editor } }),
      } as FieldDescription;
    case "date":
    case "datetime":
      return {
        type: rules.kind,
        ...presence,
        ...(rules.min === undefined ? {} : { min: rules.min }),
        ...(rules.max === undefined ? {} : { max: rules.max }),
        ...defaulted,
      } as FieldDescription;
    case "list":
      return {
        type: "list",
        ...presence,
        item: describeRequired(rules.item),
        ...(rules.min === undefined ? {} : { min: rules.min }),
        ...(rules.max === undefined ? {} : { max: rules.max }),
        ...defaulted,
      } as FieldDescription;
    case "object":
      return {
        type: "object",
        ...presence,
        fields: describeEntries(rules.fields),
        ...defaulted,
      } as FieldDescription;
    case "blocks":
      return {
        type: "blocks",
        ...presence,
        variants: Object.fromEntries(
          rules.variants.map(([name, fields]): [string, ObjectFieldDescription] => [
            name,
            { type: "object", required: true, nullable: false, fields: describeEntries(fields) },
          ]),
        ),
        ...(rules.min === undefined ? {} : { min: rules.min }),
        ...(rules.max === undefined ? {} : { max: rules.max }),
        ...defaulted,
      } as FieldDescription;
    case "json":
      return { type: "json", ...presence, ...defaulted } as FieldDescription;
    case "point":
      return { type: "point", ...presence, ...defaulted } as FieldDescription;
    case "reference":
      return {
        type: "reference",
        ...presence,
        ...(rules.collections === undefined
          ? { collection: rules.collection! }
          : { collections: [...rules.collections] }),
      };
  }
}

export function describeCollection(fields: FieldEntries): CollectionDescription {
  return { fields: describeEntries(fields) };
}
