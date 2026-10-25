import type {
  CollectionDescription,
  CompiledCollection,
  CompiledSchema,
  IssuePath,
  SchemaIssue,
  TextEditorDescription,
  ValidationIssue,
} from "./contract.ts";
import {
  collectionDefinition,
  fieldDefinition,
  type CollectionDefinitions,
  type InferOutput,
  type Modifier,
} from "./declarations.ts";
import { equalEditor, normalizeEditor } from "./editors.ts";
import { SchemaError, schemaIssue, validationIssue } from "./errors.ts";
import { receivedType, snapshotRecord } from "./records.ts";
import { validateValue, type TextRules } from "./values.ts";

type MutableRules = { -readonly [Key in keyof TextRules]: TextRules[Key] };
const issueOrder: Record<SchemaIssue["code"], number> = {
  invalid_definition: 0,
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

function compileField(
  modifiers: readonly Modifier[],
  path: IssuePath,
): { rules: TextRules; issues: SchemaIssue[] } {
  const issues: SchemaIssue[] = [];
  const rules: MutableRules = {
    optional: modifiers.some((modifier) => modifier.kind === "optional"),
    nullable: modifiers.some((modifier) => modifier.kind === "nullable"),
    unique: modifiers.some((modifier) => modifier.kind === "unique"),
  };
  const defaults = distinct(values(modifiers, "default"), Object.is);
  if (defaults.length > 1) issues.push(schemaIssue(path, { code: "conflicting_defaults" }));
  const formats = [
    ...new Set(
      modifiers.flatMap((modifier) => (modifier.kind === "format" ? [modifier.value] : [])),
    ),
  ];
  if (formats.length > 1) issues.push(schemaIssue(path, { code: "conflicting_formats" }));
  else if (formats[0]) rules.format = formats[0];
  for (const constraint of ["min", "max"] as const) {
    const limits = values(modifiers, constraint);
    if (!limits.length) continue;
    if (
      !limits.every((value): value is number => Number.isSafeInteger(value) && Number(value) >= 0)
    ) {
      issues.push(schemaIssue(path, { code: "invalid_bound", constraint }));
    } else {
      rules[constraint] = limits.reduce(
        (current, limit) =>
          constraint === "min" ? Math.max(current, limit) : Math.min(current, limit),
        constraint === "min" ? 0 : Number.MAX_SAFE_INTEGER,
      );
    }
  }
  const { min = 0, max = Number.MAX_SAFE_INTEGER } = rules;
  if (min > max) {
    issues.push(schemaIssue(path, { code: "conflicting_bounds", minimum: min, maximum: max }));
    delete rules.min;
    delete rules.max;
  }
  const choiceLists = distinct(values(modifiers, "choices"), equalChoices);
  if (choiceLists.length > 1) issues.push(schemaIssue(path, { code: "conflicting_choices" }));
  else if (choiceLists.length) {
    const choices = choiceLists[0];
    if (!Array.isArray(choices))
      issues.push(schemaIssue(path, { code: "invalid_choices", reason: "invalid_type" }));
    else if (!choices.length)
      issues.push(schemaIssue(path, { code: "invalid_choices", reason: "empty" }));
    else {
      let valid = true;
      const firstIndices = new Map<string, number>();
      const accepted: string[] = [];
      for (const [index, choice] of choices.entries()) {
        if (typeof choice !== "string") {
          issues.push(
            schemaIssue(path, { code: "invalid_choices", reason: "invalid_type", index }),
          );
          valid = false;
          continue;
        }
        accepted.push(choice);
        const causes = validateValue(choice, rules, path);
        if (causes[0]) {
          issues.push(
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
          issues.push(schemaIssue(path, { code: "duplicate_choice", index, firstIndex }));
          valid = false;
        } else firstIndices.set(choice, index);
      }
      if (valid) rules.choices = Object.freeze(accepted);
    }
  }
  const editors: TextEditorDescription[] = [];
  for (const modifier of modifiers) {
    if (modifier.kind !== "editor") continue;
    const normalized = normalizeEditor(modifier, path);
    if (normalized.ok) editors.push(normalized.editor);
    else issues.push(...normalized.issues);
  }
  const selections = distinct(editors, equalEditor);
  if (selections.length > 1) issues.push(schemaIssue(path, { code: "conflicting_editors" }));
  else if (selections[0]) {
    rules.editor = Object.freeze(selections[0]);
    if (rules.editor.type === "radio" && !choiceLists.length)
      issues.push(
        schemaIssue(path, {
          code: "incompatible_editor",
          editor: "radio",
          reason: "requires_choices",
        }),
      );
  }
  if (defaults.length === 1) {
    const value = defaults[0];
    const causes = validateValue(value, rules, path);
    if (causes[0])
      issues.push(
        schemaIssue(path, { code: "invalid_default", causes: [causes[0], ...causes.slice(1)] }),
      );
    else if (typeof value === "string" || value === null) rules.default = value;
  }
  issues.sort((left, right) => issueOrder[left.code] - issueOrder[right.code]);
  return { rules: Object.freeze(rules), issues };
}

function compiledCollection(
  fields: readonly (readonly [string, TextRules])[],
): CompiledCollection<Record<string, unknown>> {
  const knownNames = new Set(fields.map(([name]) => name));
  return Object.freeze({
    validate(input: unknown) {
      const snapshot = snapshotRecord(input);
      if (!snapshot.ok)
        return {
          ok: false as const,
          issues: [validationIssue([], { code: "invalid_document" })] as const,
        };
      const values = new Map(snapshot.entries);
      const output: [string, unknown][] = [];
      const issues: ValidationIssue[] = [];
      for (const [name, rules] of fields) {
        let value = values.get(name);
        if (value === undefined) {
          if (Object.hasOwn(rules, "default")) value = rules.default;
          else if (rules.optional) continue;
          else {
            issues.push(validationIssue([name], { code: "required" }));
            continue;
          }
        }
        const failures = validateValue(value, rules, [name]);
        if (failures.length) issues.push(...failures);
        else output.push([name, value]);
      }
      for (const name of [...values.keys()].filter((name) => !knownNames.has(name)).sort()) {
        issues.push(validationIssue([name], { code: "unknown_field" }));
      }
      return issues[0]
        ? { ok: false as const, issues: [issues[0], ...issues.slice(1)] as const }
        : { ok: true as const, data: Object.fromEntries(output) };
    },
    describe(): CollectionDescription {
      return {
        fields: Object.fromEntries(
          fields.map(([name, rules]) => [
            name,
            {
              type: "text",
              required: !rules.optional && !Object.hasOwn(rules, "default"),
              nullable: rules.nullable,
              unique: rules.unique,
              ...(rules.min === undefined ? {} : { min: rules.min }),
              ...(rules.max === undefined ? {} : { max: rules.max }),
              ...(rules.format === undefined ? {} : { format: rules.format }),
              ...(rules.choices === undefined ? {} : { choices: [...rules.choices] }),
              ...(Object.hasOwn(rules, "default") ? { default: rules.default } : {}),
              ...(rules.editor === undefined ? {} : { editor: { ...rules.editor } }),
            },
          ]),
        ),
      };
    },
  });
}

/** The runtime compiler builds one collection per declared name, so the declarations carry the output types. */
export function compileSchema<const Collections extends CollectionDefinitions>(
  definitions: Collections,
): CompiledSchema<{ [Name in keyof Collections]: InferOutput<Collections[Name]> }>;
export function compileSchema(
  definitions: unknown,
): CompiledSchema<Record<string, Record<string, unknown>>> {
  return compileUnknown(definitions);
}

function compileUnknown(
  definitions: unknown,
): CompiledSchema<Record<string, Record<string, unknown>>> {
  const root = snapshotRecord(definitions);
  if (!root.ok)
    throw new SchemaError([
      schemaIssue([], { code: "invalid_definition", expected: "record", received: root.received }),
    ]);
  const issues: SchemaIssue[] = [];
  const compiled: [string, CompiledCollection<Record<string, unknown>>][] = [];
  for (const [name, declaration] of root.entries) {
    const definition = collectionDefinition(declaration);
    if (!definition) {
      issues.push(
        schemaIssue([name], {
          code: "invalid_definition",
          expected: "collection",
          received: receivedType(declaration),
        }),
      );
      continue;
    }
    if (!definition.ok) {
      issues.push(
        schemaIssue([name], {
          code: "invalid_definition",
          expected: "record",
          received: definition.received,
        }),
      );
      continue;
    }
    const fields: [string, TextRules][] = [];
    for (const [field, value] of definition.entries) {
      const modifiers = fieldDefinition(value);
      if (!modifiers) {
        issues.push(
          schemaIssue([name, field], {
            code: "invalid_definition",
            expected: "field",
            received: receivedType(value),
          }),
        );
        continue;
      }
      const compiledField = compileField(modifiers, [name, field]);
      issues.push(...compiledField.issues);
      fields.push([field, compiledField.rules]);
    }
    compiled.push([name, compiledCollection(fields)]);
  }
  if (issues[0]) throw new SchemaError([issues[0], ...issues.slice(1)]);
  return Object.freeze(Object.fromEntries(compiled));
}

/** Narrows untrusted collection declarations, such as a loaded config module, by throwing the `SchemaError` that `compileSchema` would throw. */
export function assertCollectionDefinitions(
  definitions: unknown,
): asserts definitions is CollectionDefinitions {
  compileUnknown(definitions);
}
