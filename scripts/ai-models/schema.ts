const keywords = new Set([
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "enum",
  "const",
  "anyOf",
  "description",
  "title",
  "minimum",
  "maximum",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
]);
const types = ["object", "array", "string", "number", "integer", "boolean", "null"];

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function anthropicSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const result = { ...schema };
  const descriptions = typeof schema.description === "string" ? [schema.description] : [];
  for (const key of ["minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems"]) {
    const bound = schema[key];
    if (typeof bound !== "number" || (key === "minItems" && [0, 1].includes(bound))) continue;
    descriptions.push(`{${key}: ${bound}}`);
    delete result[key];
  }
  if (descriptions.length) result.description = descriptions.join(" ");
  if (isJsonObject(schema.properties))
    result.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([key, value]) => [
        key,
        anthropicSchema(subschema(value)),
      ]),
    );
  if (isJsonObject(schema.items)) result.items = anthropicSchema(schema.items);
  if (Array.isArray(schema.anyOf))
    result.anyOf = schema.anyOf.map((item) => anthropicSchema(subschema(item)));
  return result;
}

export function checkSchema(schema: unknown, depth = 0): asserts schema is Record<string, unknown> {
  if (!isJsonObject(schema) || depth > 16 || Object.keys(schema).some((key) => !keywords.has(key)))
    throw new Error("unsupported_schema");
  if (schema.anyOf !== undefined) {
    if (Object.keys(schema).some((key) => !["anyOf", "description", "title"].includes(key)))
      throw new Error("unsupported_schema");
    if (!Array.isArray(schema.anyOf) || schema.anyOf.length === 0)
      throw new Error("unsupported_schema");
    for (const item of schema.anyOf) checkSchema(item, depth + 1);
    return;
  }
  const acceptedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (acceptedTypes.length === 0 || acceptedTypes.some((type) => !types.includes(String(type))))
    throw new Error("unsupported_schema");
  if (acceptedTypes.includes("object")) {
    const required: unknown = schema.required;
    if (
      !isJsonObject(schema.properties) ||
      schema.additionalProperties !== false ||
      !Array.isArray(required) ||
      required.some((key) => typeof key !== "string") ||
      Object.keys(schema.properties).some((key) => !required.includes(key)) ||
      required.length !== Object.keys(schema.properties).length
    )
      throw new Error("unsupported_schema");
    for (const property of Object.values(schema.properties)) checkSchema(property, depth + 1);
  }
  if (acceptedTypes.includes("array")) checkSchema(schema.items, depth + 1);
  if (schema.enum !== undefined && (!Array.isArray(schema.enum) || schema.enum.length === 0))
    throw new Error("unsupported_schema");
  for (const key of ["minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems"]) {
    if (
      schema[key] !== undefined &&
      (typeof schema[key] !== "number" || !Number.isFinite(schema[key]))
    )
      throw new Error("unsupported_schema");
  }
}

function subschema(value: unknown): Record<string, unknown> {
  if (!isJsonObject(value)) throw new Error("unsupported_schema");
  return value;
}

export function matches(schema: Record<string, unknown>, value: unknown): boolean {
  if (Array.isArray(schema.anyOf))
    return schema.anyOf.some((item) => matches(subschema(item), value));
  const acceptedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
  const actualType = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  if (
    !acceptedTypes.includes(actualType) &&
    !(actualType === "number" && Number.isInteger(value) && acceptedTypes.includes("integer"))
  )
    return false;
  if (
    Array.isArray(schema.enum) &&
    !schema.enum.some((item) => JSON.stringify(item) === JSON.stringify(value))
  )
    return false;
  if (Object.hasOwn(schema, "const") && JSON.stringify(schema.const) !== JSON.stringify(value))
    return false;
  if (isJsonObject(value)) {
    const properties = subschema(schema.properties);
    if (
      Object.keys(value).some((key) => !Object.hasOwn(properties, key)) ||
      Object.keys(properties).some(
        (key) => !Object.hasOwn(value, key) || !matches(subschema(properties[key]), value[key]),
      )
    )
      return false;
  }
  if (Array.isArray(value)) {
    if (!value.every((item) => matches(subschema(schema.items), item))) return false;
    if (
      (typeof schema.minItems === "number" && value.length < schema.minItems) ||
      (typeof schema.maxItems === "number" && value.length > schema.maxItems)
    )
      return false;
  }
  if (
    typeof value === "string" &&
    ((typeof schema.minLength === "number" && Array.from(value).length < schema.minLength) ||
      (typeof schema.maxLength === "number" && Array.from(value).length > schema.maxLength))
  )
    return false;
  if (
    typeof value === "number" &&
    (!Number.isFinite(value) ||
      (typeof schema.minimum === "number" && value < schema.minimum) ||
      (typeof schema.maximum === "number" && value > schema.maximum))
  )
    return false;
  return true;
}
