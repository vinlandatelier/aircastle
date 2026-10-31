import { validateField } from "./composites.ts";
import type { IssuePath, SchemaIssue, TextEditorDescription } from "./contract.ts";
import { parseDate, parseDatetime } from "./dates.ts";
import { fieldDefinition, type FieldDefinition, type Modifier } from "./declarations.ts";
import { equalEditor, normalizeEditor } from "./editors.ts";
import { schemaIssue } from "./errors.ts";
import { withoutNegativeZero } from "./numbers.ts";
import type { CompiledField, FieldEntries, Rules, TextRules } from "./fields.ts";
import { receivedType, type RecordSnapshot } from "./records.ts";
import { validateText } from "./values.ts";

/** Where a field sits, which decides how `.unique()` is judged and which collections references may name. */
export interface CompileContext {
  readonly collections: ReadonlySet<string>;
  readonly unique: "allowed" | "item" | "unsupported";
}

export interface CompiledResult {
  readonly field: CompiledField;
  readonly issues: SchemaIssue[];
}

type MutableTextRules = { -readonly [Key in keyof TextRules]: TextRules[Key] };

const issueOrder: Record<SchemaIssue["code"], number> = {
  invalid_definition: 0,
  invalid_item: 0.1,
  invalid_blocks: 0.2,
  unknown_collection: 0.3,
  invalid_references: 0.4,
  unsupported_unique: 0.5,
  conflicting_defaults: 1,
  conflicting_formats: 2,
  conflicting_choices: 3,
  conflicting_editors: 4,
  invalid_bound: 5,
  conflicting_bounds: 6,
  invalid_editor: 7,
  unknown_editor: 8,
  invalid_editor_options: 9,
  incompatible_editor: 10,
  invalid_choices: 11,
  duplicate_choice: 12,
  invalid_default: 13,
};

const placeholder: CompiledField = {
  optional: false,
  nullable: false,
  hasDefault: false,
  rules: { kind: "json" },
};

function values(
  modifiers: readonly Modifier[],
  kind: "min" | "max" | "default" | "choices",
): unknown[] {
  return modifiers.flatMap((modifier) =>
    modifier.kind === kind && "value" in modifier ? [modifier.value] : [],
  );
}

function distinct<Value>(
  items: readonly Value[],
  equal: (left: Value, right: Value) => boolean,
): Value[] {
  return items.filter(
    (item, index) => !items.slice(0, index).some((previous) => equal(previous, item)),
  );
}

function equalChoices(left: unknown, right: unknown): boolean {
  if (!Array.isArray(left) || !Array.isArray(right)) return Object.is(left, right);
  return (
    left.length === right.length &&
    left.every((value: unknown, index: number) => Object.is(value, right[index]))
  );
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object")
    return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const leftKeys = Reflect.ownKeys(left);
  const rightKeys = Reflect.ownKeys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.hasOwn(right, key) &&
        deepEqual(
          (left as Record<PropertyKey, unknown>)[key],
          (right as Record<PropertyKey, unknown>)[key],
        ),
    )
  );
}

function has(modifiers: readonly Modifier[], kind: Modifier["kind"]): boolean {
  return modifiers.some((modifier) => modifier.kind === kind);
}

function compileBounds<Bound extends number | string>(
  modifiers: readonly Modifier[],
  path: IssuePath,
  own: SchemaIssue[],
  parse: (value: unknown) => Bound | undefined,
): { min?: Bound; max?: Bound } {
  const bounds: { min?: Bound; max?: Bound } = {};
  for (const constraint of ["min", "max"] as const) {
    const limits = values(modifiers, constraint);
    if (!limits.length) continue;
    const parsed = limits.map(parse);
    if (parsed.some((limit) => limit === undefined)) {
      own.push(schemaIssue(path, { code: "invalid_bound", constraint }));
      continue;
    }
    const valid = parsed as Bound[];
    bounds[constraint] = valid.reduce((current, limit) =>
      (constraint === "min") === limit > current ? limit : current,
    );
  }
  if (bounds.min !== undefined && bounds.max !== undefined && bounds.min > bounds.max) {
    own.push(
      schemaIssue(path, {
        code: "conflicting_bounds",
        minimum: bounds.min,
        maximum: bounds.max,
      }),
    );
    return {};
  }
  return bounds;
}

const countBound = (value: unknown): number | undefined =>
  Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : undefined;

function numberBound(integer: boolean) {
  return (value: unknown): number | undefined =>
    typeof value === "number" && (integer ? Number.isSafeInteger(value) : Number.isFinite(value))
      ? withoutNegativeZero(value)
      : undefined;
}

function compileText(
  modifiers: readonly Modifier[],
  path: IssuePath,
  own: SchemaIssue[],
  context: CompileContext,
): TextRules {
  const rules: MutableTextRules = { kind: "text", unique: false };
  if (has(modifiers, "unique")) {
    if (context.unique === "allowed") rules.unique = true;
    else if (context.unique === "unsupported")
      own.push(schemaIssue(path, { code: "unsupported_unique" }));
  }
  const formats = [
    ...new Set(
      modifiers.flatMap((modifier) => (modifier.kind === "format" ? [modifier.value] : [])),
    ),
  ];
  if (formats.length > 1) own.push(schemaIssue(path, { code: "conflicting_formats" }));
  else if (formats[0]) rules.format = formats[0];
  Object.assign(rules, compileBounds(modifiers, path, own, countBound));
  const choiceLists = distinct(values(modifiers, "choices"), equalChoices);
  if (choiceLists.length > 1) own.push(schemaIssue(path, { code: "conflicting_choices" }));
  else if (choiceLists.length) {
    const choices = choiceLists[0];
    if (!Array.isArray(choices))
      own.push(schemaIssue(path, { code: "invalid_choices", reason: "invalid_type" }));
    else if (!choices.length)
      own.push(schemaIssue(path, { code: "invalid_choices", reason: "empty" }));
    else {
      let valid = true;
      const firstIndices = new Map<string, number>();
      for (const [index, choice] of choices.entries()) {
        if (typeof choice !== "string") {
          own.push(schemaIssue(path, { code: "invalid_choices", reason: "invalid_type", index }));
          valid = false;
          continue;
        }
        const causes = validateText(choice, rules, path);
        if (causes[0]) {
          own.push(
            schemaIssue(path, {
              code: "invalid_choices",
              reason: "violates_constraints",
              index,
              causes: [causes[0], ...causes.slice(1)],
            }),
          );
          valid = false;
        }
        const firstIndex = firstIndices.get(choice);
        if (firstIndex !== undefined) {
          own.push(schemaIssue(path, { code: "duplicate_choice", index, firstIndex }));
          valid = false;
        } else firstIndices.set(choice, index);
      }
      if (valid) rules.choices = Object.freeze([...choices] as string[]);
    }
  }
  const editors: TextEditorDescription[] = [];
  for (const modifier of modifiers) {
    if (modifier.kind !== "editor") continue;
    const normalized = normalizeEditor(modifier, path);
    if (normalized.ok) editors.push(normalized.editor);
    else own.push(...normalized.issues);
  }
  const selections = distinct(editors, equalEditor);
  if (selections.length > 1) own.push(schemaIssue(path, { code: "conflicting_editors" }));
  else if (selections[0]) {
    rules.editor = Object.freeze(selections[0]);
    if (rules.editor.type === "radio" && !choiceLists.length)
      own.push(
        schemaIssue(path, {
          code: "incompatible_editor",
          editor: "radio",
          reason: "requires_choices",
        }),
      );
  }
  return Object.freeze(rules);
}

function compileBoolean(
  modifiers: readonly Modifier[],
  path: IssuePath,
  own: SchemaIssue[],
): Rules {
  const selections = new Set<"checkbox" | "switch">();
  for (const modifier of modifiers) {
    if (modifier.kind !== "editor") continue;
    const name = modifier.name;
    if (typeof name !== "string")
      own.push(
        schemaIssue(path, {
          code: "invalid_editor",
          expected: "string",
          received: receivedType(name),
        }),
      );
    else if (name === "checkbox" || name === "switch") selections.add(name);
    else own.push(schemaIssue(path, { code: "unknown_editor", editor: name }));
  }
  if (selections.size > 1) own.push(schemaIssue(path, { code: "conflicting_editors" }));
  return selections.has("switch") && selections.size === 1
    ? { kind: "boolean", editor: "switch" }
    : { kind: "boolean" };
}

function compileEntries(
  snapshot: unknown,
  path: IssuePath,
  context: CompileContext,
  children: SchemaIssue[],
): FieldEntries {
  const record = snapshot as RecordSnapshot;
  if (!record.ok) {
    children.push(
      schemaIssue(path, {
        code: "invalid_definition",
        expected: "record",
        received: record.received,
      }),
    );
    return [];
  }
  const entries: (readonly [string, CompiledField])[] = [];
  for (const [name, value] of record.entries) {
    const definition = fieldDefinition(value);
    if (!definition) {
      children.push(
        schemaIssue([...path, name], {
          code: "invalid_definition",
          expected: "field",
          received: receivedType(value),
        }),
      );
      continue;
    }
    const compiled = compileField(definition, [...path, name], context);
    children.push(...compiled.issues);
    entries.push([name, compiled.field]);
  }
  return entries;
}

function compileList(
  definition: FieldDefinition,
  path: IssuePath,
  context: CompileContext,
  own: SchemaIssue[],
  children: SchemaIssue[],
): CompiledField {
  const itemDefinition = fieldDefinition(definition.argument);
  if (!itemDefinition) {
    own.push(
      schemaIssue(path, {
        code: "invalid_definition",
        expected: "field",
        received: receivedType(definition.argument),
      }),
    );
    return placeholder;
  }
  const modifiers = itemDefinition.modifiers;
  if (has(modifiers, "optional"))
    own.push(schemaIssue(path, { code: "invalid_item", modifier: "optional" }));
  if (has(modifiers, "default"))
    own.push(schemaIssue(path, { code: "invalid_item", modifier: "default" }));
  if (has(modifiers, "unique") && context.unique === "allowed")
    own.push(schemaIssue(path, { code: "invalid_item", modifier: "unique" }));
  if (itemDefinition.kind === "object") {
    const shape = itemDefinition.argument as RecordSnapshot;
    if (shape.ok && shape.entries.some(([name]) => name === "id"))
      own.push(schemaIssue(path, { code: "invalid_item", field: "id" }));
  }
  const compiled = compileField(itemDefinition, path, {
    ...context,
    unique: context.unique === "allowed" ? "item" : "unsupported",
  });
  children.push(...compiled.issues);
  return compiled.field;
}

function compileBlocks(
  definition: FieldDefinition,
  path: IssuePath,
  context: CompileContext,
  own: SchemaIssue[],
  children: SchemaIssue[],
): Rules["kind"] extends never ? never : readonly (readonly [string, FieldEntries])[] {
  const record = definition.argument as RecordSnapshot;
  if (!record.ok) {
    own.push(
      schemaIssue(path, {
        code: "invalid_definition",
        expected: "record",
        received: record.received,
      }),
    );
    return [];
  }
  if (!record.entries.length)
    own.push(schemaIssue(path, { code: "invalid_blocks", reason: "empty" }));
  const variants: (readonly [string, FieldEntries])[] = [];
  for (const [variant, declaration] of record.entries) {
    const variantDefinition = fieldDefinition(declaration);
    if (variantDefinition?.kind !== "object") {
      own.push(schemaIssue(path, { code: "invalid_blocks", reason: "not_object", variant }));
      continue;
    }
    if (
      has(variantDefinition.modifiers, "optional") ||
      has(variantDefinition.modifiers, "nullable") ||
      has(variantDefinition.modifiers, "default")
    )
      own.push(schemaIssue(path, { code: "invalid_blocks", reason: "modifier", variant }));
    const shape = variantDefinition.argument as RecordSnapshot;
    if (shape.ok)
      for (const [name] of shape.entries) {
        if (name === "type" || name === "id")
          own.push(
            schemaIssue(path, {
              code: "invalid_blocks",
              reason: "reserved_field",
              variant,
              field: name,
            }),
          );
      }
    variants.push([
      variant,
      compileEntries(shape, [...path, variant], { ...context, unique: "unsupported" }, children),
    ]);
  }
  return variants;
}

function compileReference(
  definition: FieldDefinition,
  path: IssuePath,
  context: CompileContext,
  own: SchemaIssue[],
): Rules {
  const target = definition.argument;
  if (!Array.isArray(target)) {
    const collection = typeof target === "string" ? target : "";
    if (!context.collections.has(collection))
      own.push(schemaIssue(path, { code: "unknown_collection", collection }));
    return { kind: "reference", collection };
  }
  if (!target.length) own.push(schemaIssue(path, { code: "invalid_references", reason: "empty" }));
  const seen = new Set<unknown>();
  target.forEach((name: unknown, index: number) => {
    if (seen.has(name))
      own.push(schemaIssue(path, { code: "invalid_references", reason: "duplicate", index }));
    else if (!(typeof name === "string" && context.collections.has(name)))
      own.push(
        schemaIssue(path, {
          code: "unknown_collection",
          collection: typeof name === "string" ? name : "",
          index,
        }),
      );
    seen.add(name);
  });
  return { kind: "reference", collections: target.filter((name) => typeof name === "string") };
}

/**
 * Compiles one declaration. A field's own issues come first in precedence order, then the issues of
 * its item, fields and variants in declaration order.
 */
export function compileField(
  definition: FieldDefinition,
  path: IssuePath,
  context: CompileContext,
): CompiledResult {
  const { modifiers } = definition;
  const own: SchemaIssue[] = [];
  const children: SchemaIssue[] = [];
  const optional = has(modifiers, "optional");
  const nullable = has(modifiers, "nullable");
  let rules: Rules;
  let listItem: CompiledField | undefined;
  switch (definition.kind) {
    case "text":
      rules = compileText(modifiers, path, own, context);
      break;
    case "number": {
      const integer = has(modifiers, "int");
      rules = {
        kind: "number",
        integer,
        ...compileBounds(modifiers, path, own, numberBound(integer)),
      };
      break;
    }
    case "boolean":
      rules = compileBoolean(modifiers, path, own);
      break;
    case "date":
      rules = { kind: "date", ...compileBounds(modifiers, path, own, parseDate) };
      break;
    case "datetime":
      rules = { kind: "datetime", ...compileBounds(modifiers, path, own, parseDatetime) };
      break;
    case "list":
      listItem = compileList(definition, path, context, own, children);
      rules = { kind: "list", item: listItem, ...compileBounds(modifiers, path, own, countBound) };
      break;
    case "object":
      rules = {
        kind: "object",
        fields: compileEntries(
          definition.argument,
          path,
          { ...context, unique: "unsupported" },
          children,
        ),
      };
      break;
    case "blocks":
      rules = {
        kind: "blocks",
        variants: compileBlocks(definition, path, context, own, children),
        ...compileBounds(modifiers, path, own, countBound),
      };
      break;
    case "json":
      rules = { kind: "json" };
      break;
    case "point":
      rules = { kind: "point" };
      break;
    case "reference":
      rules = compileReference(definition, path, context, own);
      break;
  }
  const base: CompiledField = { optional, nullable, hasDefault: false, rules };
  const structural = own.some(
    (issue) =>
      issue.code === "invalid_definition" ||
      issue.code === "invalid_blocks" ||
      issue.code === "invalid_references" ||
      issue.code === "unknown_collection",
  );
  const declared = values(modifiers, "default");
  const normalized = declared.map((value) => {
    const result = structural ? undefined : validateField(base, value, path, false);
    return result?.ok ? result.value : value;
  });
  const defaults = distinct(normalized, deepEqual);
  let field = base;
  if (defaults.length > 1) own.push(schemaIssue(path, { code: "conflicting_defaults" }));
  else if (defaults.length === 1 && !structural && !children.length) {
    const result = validateField(base, declared[0], path, false);
    if (result.ok) field = { ...base, hasDefault: true, default: result.value };
    else
      own.push(
        schemaIssue(path, {
          code: "invalid_default",
          causes: [result.issues[0]!, ...result.issues.slice(1)],
        }),
      );
  }
  own.sort((left, right) => issueOrder[left.code] - issueOrder[right.code]);
  return { field, issues: [...own, ...children] };
}
