import { validateRecord } from "./composites.ts";
import { compileField, type CompileContext } from "./compile-field.ts";
import type {
  CollectionDescription,
  CompiledCollection,
  CompiledSchema,
  SchemaIssue,
  ValidationIssue,
} from "./contract.ts";
import { describeCollection } from "./describe.ts";
import {
  collectionDefinition,
  fieldDefinition,
  type CollectionDefinitions,
  type InferOutput,
} from "./declarations.ts";
import { SchemaError, schemaIssue, validationIssue } from "./errors.ts";
import type { FieldEntries } from "./fields.ts";
import { receivedType, snapshotRecord } from "./records.ts";

function compiledCollection(fields: FieldEntries): CompiledCollection<Record<string, unknown>> {
  return Object.freeze({
    validate(input: unknown) {
      const snapshot = snapshotRecord(input);
      if (!snapshot.ok)
        return {
          ok: false as const,
          issues: [validationIssue([], { code: "invalid_document" })] as const,
        };
      const result = validateRecord(fields, new Map(snapshot.entries), [], true);
      if (result.ok) return { ok: true as const, data: result.value as Record<string, unknown> };
      const [first, ...rest] = result.issues as [ValidationIssue, ...ValidationIssue[]];
      return { ok: false as const, issues: [first, ...rest] as const };
    },
    describe(): CollectionDescription {
      return describeCollection(fields);
    },
  });
}

export function compileSchema<const Collections extends CollectionDefinitions>(
  definitions: Collections,
): CompiledSchema<{ [Name in keyof Collections]: InferOutput<Collections[Name]> }> {
  const root = snapshotRecord(definitions);
  if (!root.ok)
    throw new SchemaError([
      schemaIssue([], { code: "invalid_definition", expected: "record", received: root.received }),
    ]);
  const context: CompileContext = {
    collections: new Set(
      root.entries
        .filter(([, declaration]) => collectionDefinition(declaration))
        .map(([name]) => name),
    ),
    unique: "allowed",
  };
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
    const fields: [string, ReturnType<typeof compileField>["field"]][] = [];
    for (const [field, value] of definition.entries) {
      const fieldDeclaration = fieldDefinition(value);
      if (!fieldDeclaration) {
        issues.push(
          schemaIssue([name, field], {
            code: "invalid_definition",
            expected: "field",
            received: receivedType(value),
          }),
        );
        continue;
      }
      const result = compileField(fieldDeclaration, [name, field], context);
      issues.push(...result.issues);
      fields.push([field, result.field]);
    }
    compiled.push([name, compiledCollection(fields)]);
  }
  if (issues[0]) throw new SchemaError([issues[0], ...issues.slice(1)]);
  return Object.freeze(Object.fromEntries(compiled)) as CompiledSchema<{
    [Name in keyof Collections]: InferOutput<Collections[Name]>;
  }>;
}
