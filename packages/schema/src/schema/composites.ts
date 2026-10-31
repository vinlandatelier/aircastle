import type { IssuePath, ValidationIssue } from "./contract.ts";
import { validateDate } from "./dates.ts";
import { validationIssue } from "./errors.ts";
import type {
  BlocksRules,
  CompiledField,
  FieldEntries,
  ListRules,
  ObjectRules,
  Outcome,
  ReferenceRules,
} from "./fields.ts";
import { validateJson } from "./json.ts";
import { validateNumber } from "./numbers.ts";
import { validatePoint } from "./points.ts";
import { receivedType, snapshotRecord } from "./records.ts";
import { integrityIssues, validateText } from "./values.ts";

type Entries = ReadonlyMap<string, unknown>;
type Read<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly issues: ValidationIssue[] };

const success = (value: unknown): Outcome => ({ ok: true, value });
const failure = (...issues: ValidationIssue[]): Outcome => ({ ok: false, issues });

function typeIssue(
  path: IssuePath,
  expected: "string" | "boolean" | "array" | "object" | "json",
  value: unknown,
): ValidationIssue {
  return validationIssue(path, { code: "invalid_type", expected, received: receivedType(value) });
}

function readObject(value: unknown, path: IssuePath): Read<Entries> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return { ok: false, issues: [typeIssue(path, "object", value)] };
  const snapshot = snapshotRecord(value);
  return snapshot.ok
    ? { ok: true, value: new Map(snapshot.entries) }
    : { ok: false, issues: [validationIssue(path, { code: "invalid_object" })] };
}

function readList(value: unknown, path: IssuePath): Read<readonly unknown[]> {
  if (!Array.isArray(value)) return { ok: false, issues: [typeIssue(path, "array", value)] };
  const malformed: Read<readonly unknown[]> = {
    ok: false,
    issues: [validationIssue(path, { code: "invalid_list" })],
  };
  if (Reflect.ownKeys(value).length !== value.length + 1) return malformed;
  const items: unknown[] = [];
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, "value") || !descriptor.enumerable)
      return malformed;
    items.push(descriptor.value);
  }
  return { ok: true, value: items };
}

/**
 * Validates declared fields in order, then unknown keys in UTF-16 order. `reserved` names are
 * consumed by the caller and neither validated nor reported as unknown.
 */
export function validateEntries(
  fields: FieldEntries,
  entries: Entries,
  path: IssuePath,
  reserved: ReadonlySet<string>,
  allowIds: boolean,
): { issues: ValidationIssue[]; output: [string, unknown][] } {
  const issues: ValidationIssue[] = [];
  const output: [string, unknown][] = [];
  const declared = new Set<string>();
  for (const [name, field] of fields) {
    declared.add(name);
    const fieldPath = [...path, name];
    const value = entries.get(name);
    if (value === undefined) {
      if (field.hasDefault) output.push([name, structuredClone(field.default)]);
      else if (!field.optional) issues.push(validationIssue(fieldPath, { code: "required" }));
      continue;
    }
    const result = validateField(field, value, fieldPath, allowIds);
    if (result.ok) output.push([name, result.value]);
    else issues.push(...result.issues);
  }
  for (const name of [...entries.keys()].sort()) {
    if (!declared.has(name) && !reserved.has(name))
      issues.push(validationIssue([...path, name], { code: "unknown_field" }));
  }
  return { issues, output };
}

export function validateRecord(
  fields: FieldEntries,
  entries: Entries,
  path: IssuePath,
  allowIds: boolean,
): Outcome {
  const { issues, output } = validateEntries(fields, entries, path, new Set(), allowIds);
  return issues.length ? { ok: false, issues } : success(Object.fromEntries(output));
}

function validateObject(
  rules: ObjectRules,
  value: unknown,
  path: IssuePath,
  allowIds: boolean,
): Outcome {
  const read = readObject(value, path);
  return read.ok
    ? validateRecord(rules.fields, read.value, path, allowIds)
    : failure(...read.issues);
}

interface IdCheck {
  readonly issues: ValidationIssue[];
  readonly id?: string;
}

function checkId(
  entries: Entries,
  path: IssuePath,
  index: number,
  seen: Map<string, number>,
  allowIds: boolean,
): IdCheck {
  const raw = entries.get("id");
  if (raw === undefined) return { issues: [] };
  const idPath = [...path, "id"];
  if (!allowIds) return { issues: [validationIssue(idPath, { code: "unknown_field" })] };
  if (typeof raw !== "string") return { issues: [typeIssue(idPath, "string", raw)] };
  if (raw === "") return { issues: [validationIssue(idPath, { code: "invalid_id" })] };
  const integrity = integrityIssues(raw, idPath);
  if (integrity.length) return { issues: integrity };
  const first = seen.get(raw);
  if (first !== undefined)
    return { issues: [validationIssue(idPath, { code: "duplicate_id", firstIndex: first })] };
  seen.set(raw, index);
  return { issues: [], id: raw };
}

function validateRow(
  item: CompiledField,
  value: unknown,
  path: IssuePath,
  index: number,
  seen: Map<string, number>,
  allowIds: boolean,
): Outcome {
  if (value === null && item.nullable) return success(null);
  const read = readObject(value, path);
  if (!read.ok) return failure(...read.issues);
  const rules = item.rules as ObjectRules;
  const identity = checkId(read.value, path, index, seen, allowIds);
  const body = validateEntries(rules.fields, read.value, path, new Set(["id"]), allowIds);
  const issues = [...identity.issues, ...body.issues];
  if (issues.length) return failure(...issues);
  return success(
    Object.fromEntries([
      ...(identity.id === undefined ? [] : [["id", identity.id]]),
      ...body.output,
    ]),
  );
}

function validateBlock(
  variants: ReadonlyMap<string, FieldEntries>,
  value: unknown,
  path: IssuePath,
  index: number,
  seen: Map<string, number>,
  allowIds: boolean,
): Outcome {
  const read = readObject(value, path);
  if (!read.ok) return failure(...read.issues);
  const type = read.value.get("type");
  const fields = typeof type === "string" ? variants.get(type) : undefined;
  if (typeof type !== "string" || !fields)
    return failure(
      validationIssue(path, { code: "invalid_block_type", allowed: [...variants.keys()] }),
    );
  const identity = checkId(read.value, path, index, seen, allowIds);
  const body = validateEntries(fields, read.value, path, new Set(["type", "id"]), allowIds);
  const issues = [...identity.issues, ...body.issues];
  if (issues.length) return failure(...issues);
  return success(
    Object.fromEntries([
      ["type", type],
      ...(identity.id === undefined ? [] : [["id", identity.id]]),
      ...body.output,
    ]),
  );
}

function validateItems(
  rules: { readonly min?: number; readonly max?: number },
  value: unknown,
  path: IssuePath,
  validateItem: (
    item: unknown,
    itemPath: IssuePath,
    index: number,
    seen: Map<string, number>,
  ) => Outcome,
): Outcome {
  const read = readList(value, path);
  if (!read.ok) return failure(...read.issues);
  const items = read.value;
  const issues: ValidationIssue[] = [];
  if (rules.min !== undefined && items.length < rules.min)
    issues.push(
      validationIssue(path, { code: "too_few", minimum: rules.min, actual: items.length }),
    );
  if (rules.max !== undefined && items.length > rules.max)
    issues.push(
      validationIssue(path, { code: "too_many", maximum: rules.max, actual: items.length }),
    );
  const seen = new Map<string, number>();
  const output: unknown[] = [];
  items.forEach((item, index) => {
    const result = validateItem(item, [...path, index], index, seen);
    if (result.ok) output.push(result.value);
    else issues.push(...result.issues);
  });
  return issues.length ? failure(...issues) : success(output);
}

function validateListField(
  rules: ListRules,
  value: unknown,
  path: IssuePath,
  allowIds: boolean,
): Outcome {
  const { item } = rules;
  const rows = item.rules.kind === "object";
  return validateItems(rules, value, path, (entry, itemPath, index, seen) =>
    rows
      ? validateRow(item, entry, itemPath, index, seen, allowIds)
      : validateField(item, entry, itemPath, allowIds),
  );
}

function validateBlocksField(
  rules: BlocksRules,
  value: unknown,
  path: IssuePath,
  allowIds: boolean,
): Outcome {
  const variants = new Map(rules.variants);
  return validateItems(rules, value, path, (entry, itemPath, index, seen) =>
    validateBlock(variants, entry, itemPath, index, seen, allowIds),
  );
}

function validateIdText(value: unknown, path: IssuePath, empty: "invalid_reference"): Outcome {
  if (typeof value !== "string") return failure(typeIssue(path, "string", value));
  if (value === "") return failure(validationIssue(path, { code: empty }));
  const integrity = integrityIssues(value, path);
  return integrity.length ? failure(...integrity) : success(value);
}

function validateReference(rules: ReferenceRules, value: unknown, path: IssuePath): Outcome {
  const { collections } = rules;
  if (!collections) return validateIdText(value, path, "invalid_reference");
  const read = readObject(value, path);
  if (!read.ok) return failure(...read.issues);
  const issues: ValidationIssue[] = [];
  const collection = read.value.get("collection");
  const id = read.value.get("id");
  if (collection !== undefined && typeof collection !== "string")
    issues.push(typeIssue([...path, "collection"], "string", collection));
  else if (collection === undefined || !collections.includes(collection))
    issues.push(
      validationIssue([...path, "collection"], {
        code: "invalid_choice",
        allowed: [...collections],
      }),
    );
  if (id === undefined) issues.push(validationIssue([...path, "id"], { code: "required" }));
  else {
    const result = validateIdText(id, [...path, "id"], "invalid_reference");
    if (!result.ok) issues.push(...result.issues);
  }
  for (const key of [...read.value.keys()].sort()) {
    if (key !== "collection" && key !== "id")
      issues.push(validationIssue([...path, key], { code: "unknown_field" }));
  }
  return issues.length ? failure(...issues) : success({ collection, id });
}

/**
 * Validates a present, non-undefined value against a compiled field and returns its normalized
 * output. `allowIds` is false when checking declared defaults, which may not carry row or block ids.
 */
export function validateField(
  field: CompiledField,
  value: unknown,
  path: IssuePath,
  allowIds: boolean,
): Outcome {
  if (value === null && field.nullable) return success(null);
  const { rules } = field;
  switch (rules.kind) {
    case "text": {
      const issues = validateText(value, rules, path);
      return issues.length ? failure(...issues) : success(value);
    }
    case "number":
      return validateNumber(value, rules, path);
    case "boolean":
      return typeof value === "boolean"
        ? success(value)
        : failure(typeIssue(path, "boolean", value));
    case "date":
    case "datetime":
      return validateDate(value, rules, path);
    case "list":
      return validateListField(rules, value, path, allowIds);
    case "object":
      return validateObject(rules, value, path, allowIds);
    case "blocks":
      return validateBlocksField(rules, value, path, allowIds);
    case "json":
      return value === null || value === undefined
        ? failure(typeIssue(path, "json", value))
        : validateJson(value, path);
    case "point":
      return validatePoint(value, path);
    case "reference":
      return validateReference(rules, value, path);
  }
}
