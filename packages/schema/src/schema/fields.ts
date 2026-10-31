import type { TextEditorDescription, ValidationIssue } from "./contract.ts";

/** Result of validating one value: the normalized output, or every issue found. */
export type Outcome =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly issues: ValidationIssue[] };

export interface TextRules {
  readonly kind: "text";
  readonly unique: boolean;
  readonly min?: number;
  readonly max?: number;
  readonly format?: "email" | "url";
  readonly choices?: readonly string[];
  readonly editor?: TextEditorDescription;
}

export interface NumberRules {
  readonly kind: "number";
  readonly integer: boolean;
  readonly min?: number;
  readonly max?: number;
}

export interface BooleanRules {
  readonly kind: "boolean";
  readonly editor?: "switch";
}

export interface DateRules {
  readonly kind: "date" | "datetime";
  readonly min?: string;
  readonly max?: string;
}

export interface ListRules {
  readonly kind: "list";
  readonly item: CompiledField;
  readonly min?: number;
  readonly max?: number;
}

export interface ObjectRules {
  readonly kind: "object";
  readonly fields: FieldEntries;
}

export interface BlocksRules {
  readonly kind: "blocks";
  readonly variants: readonly (readonly [string, FieldEntries])[];
  readonly min?: number;
  readonly max?: number;
}

export interface JsonRules {
  readonly kind: "json";
}

export interface PointRules {
  readonly kind: "point";
}

export interface ReferenceRules {
  readonly kind: "reference";
  readonly collection?: string;
  readonly collections?: readonly string[];
}

export type Rules =
  | TextRules
  | NumberRules
  | BooleanRules
  | DateRules
  | ListRules
  | ObjectRules
  | BlocksRules
  | JsonRules
  | PointRules
  | ReferenceRules;

/** A field after compilation: shared presence semantics plus the kind's rules. `default` holds validated output. */
export interface CompiledField {
  readonly optional: boolean;
  readonly nullable: boolean;
  readonly hasDefault: boolean;
  readonly default?: unknown;
  readonly rules: Rules;
}

export type FieldEntries = readonly (readonly [string, CompiledField])[];
