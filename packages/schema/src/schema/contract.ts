export type IssuePath = readonly (string | number)[];

/** The base kind a value must have, named in `invalid_type` issues. */
export type ExpectedType = "string" | "number" | "boolean" | "array" | "object" | "json";

export type ReceivedType =
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "undefined"
  | "array"
  | "object"
  | "bigint"
  | "symbol"
  | "function";

interface IssueDetails {
  readonly path: IssuePath;
  /** Readable wording may change; codes and structured details are stable. */
  readonly message: string;
}

export type ValidationIssue = IssueDetails &
  (
    | {
        readonly code:
          | "required"
          | "invalid_document"
          | "invalid_unicode"
          | "invalid_character"
          | "invalid_email"
          | "invalid_url"
          | "unknown_field"
          | "not_integer"
          | "invalid_date"
          | "invalid_datetime"
          | "invalid_list"
          | "invalid_object"
          | "invalid_reference"
          | "invalid_id"
          | "invalid_json"
          | "invalid_point";
      }
    | {
        readonly code: "invalid_type";
        readonly expected: ExpectedType;
        readonly received: ReceivedType;
      }
    | {
        readonly code: "too_small";
        readonly minimum: number;
        readonly actual: number;
      }
    | {
        readonly code: "too_large";
        readonly maximum: number;
        readonly actual: number;
      }
    | {
        readonly code: "too_early";
        readonly minimum: string;
        readonly actual: string;
      }
    | {
        readonly code: "too_late";
        readonly maximum: string;
        readonly actual: string;
      }
    | {
        readonly code: "too_few";
        readonly minimum: number;
        readonly actual: number;
      }
    | {
        readonly code: "too_many";
        readonly maximum: number;
        readonly actual: number;
      }
    | {
        readonly code: "out_of_range";
        readonly minimum: number;
        readonly maximum: number;
        readonly actual: number;
      }
    | {
        readonly code: "not_found";
        readonly collection: string;
      }
    | {
        readonly code: "invalid_block_type";
        readonly allowed: readonly string[];
      }
    | {
        readonly code: "duplicate_id";
        readonly firstIndex: number;
      }
    | {
        readonly code: "too_short";
        readonly minimum: number;
        readonly actual: number;
        readonly unit: "graphemes";
      }
    | {
        readonly code: "too_long";
        readonly maximum: number;
        readonly actual: number;
        readonly unit: "graphemes";
      }
    | {
        readonly code: "invalid_choice";
        readonly allowed: readonly string[];
      }
  );

export type NonemptyIssues<Issue> = readonly [Issue, ...Issue[]];

export type ValidationResult<Output extends object> =
  | { readonly ok: true; readonly data: Output }
  | { readonly ok: false; readonly issues: NonemptyIssues<ValidationIssue> };

export type SchemaIssue = IssueDetails &
  (
    | {
        readonly code: "invalid_definition";
        readonly expected: "record" | "collection" | "field";
        readonly received: ReceivedType;
      }
    | {
        readonly code:
          | "conflicting_defaults"
          | "conflicting_formats"
          | "conflicting_choices"
          | "conflicting_editors";
      }
    | {
        readonly code: "invalid_bound";
        readonly constraint: "min" | "max";
      }
    | {
        readonly code: "conflicting_bounds";
        readonly minimum: number | string;
        readonly maximum: number | string;
      }
    | {
        readonly code: "invalid_item";
        readonly modifier: "optional" | "default" | "unique";
      }
    | {
        readonly code: "invalid_item";
        readonly field: "id";
      }
    | {
        readonly code: "invalid_blocks";
        readonly reason: "empty" | "not_object" | "modifier" | "reserved_field";
        readonly variant?: string;
        readonly field?: string;
      }
    | {
        readonly code: "unknown_collection";
        readonly collection: string;
        readonly index?: number;
      }
    | {
        readonly code: "invalid_references";
        readonly reason: "empty" | "duplicate";
        readonly index?: number;
      }
    | {
        readonly code: "unsupported_unique";
      }
    | {
        readonly code: "invalid_default";
        readonly causes: NonemptyIssues<ValidationIssue>;
      }
    | {
        readonly code: "invalid_choices";
        readonly reason: "empty" | "invalid_type";
      }
    | {
        readonly code: "invalid_choices";
        readonly reason: "invalid_type";
        readonly index: number;
      }
    | {
        readonly code: "invalid_choices";
        readonly reason: "violates_constraints";
        readonly index: number;
        readonly causes: NonemptyIssues<ValidationIssue>;
      }
    | {
        readonly code: "duplicate_choice";
        readonly index: number;
        readonly firstIndex: number;
      }
    | {
        readonly code: "invalid_editor";
        readonly expected: "string";
        readonly received: ReceivedType;
      }
    | {
        readonly code: "unknown_editor";
        readonly editor: string;
      }
    | {
        readonly code: "invalid_editor_options";
        readonly option: string;
        readonly reason: "unknown_option" | "invalid_value";
      }
    | {
        readonly code: "incompatible_editor";
        readonly editor: string;
        readonly reason: "requires_choices";
      }
  );

export type CodeLanguage =
  | "plaintext"
  | "javascript"
  | "typescript"
  | "json"
  | "html"
  | "css"
  | "markdown"
  | "sql";

export type TextEditorDescription =
  | { readonly type: "textarea"; readonly rows: number }
  | { readonly type: "code"; readonly language: CodeLanguage }
  | { readonly type: "radio" };

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

interface FieldPresence {
  /** Whether the caller must supply this field, before defaults. */
  readonly required: boolean;
  readonly nullable: boolean;
}

export interface TextFieldDescription extends FieldPresence {
  readonly type: "text";
  readonly unique: boolean;
  readonly min?: number;
  readonly max?: number;
  readonly choices?: readonly string[];
  readonly default?: string | null;
  readonly format?: "email" | "url";
  /** Explicit editor metadata; omitted for the plain text input. */
  readonly editor?: TextEditorDescription;
}

export interface NumberFieldDescription extends FieldPresence {
  readonly type: "number";
  readonly integer: boolean;
  readonly min?: number;
  readonly max?: number;
  readonly default?: number | null;
}

export interface BooleanEditorDescription {
  readonly type: "switch";
}

export interface BooleanFieldDescription extends FieldPresence {
  readonly type: "boolean";
  readonly default?: boolean | null;
  /** Explicit editor metadata; omitted for the default checkbox. */
  readonly editor?: BooleanEditorDescription;
}

export interface DateFieldDescription extends FieldPresence {
  readonly type: "date" | "datetime";
  readonly min?: string;
  readonly max?: string;
  readonly default?: string | null;
}

export interface ListFieldDescription extends FieldPresence {
  readonly type: "list";
  readonly item: FieldDescription;
  readonly min?: number;
  readonly max?: number;
  readonly default?: readonly JsonValue[] | null;
}

export interface ObjectFieldDescription extends FieldPresence {
  readonly type: "object";
  readonly fields: Readonly<Record<string, FieldDescription>>;
  readonly default?: Readonly<Record<string, JsonValue>> | null;
}

export type ReferenceFieldDescription = FieldPresence &
  (
    | { readonly type: "reference"; readonly collection: string }
    | { readonly type: "reference"; readonly collections: readonly string[] }
  );

export interface BlocksFieldDescription extends FieldPresence {
  readonly type: "blocks";
  readonly variants: Readonly<Record<string, ObjectFieldDescription>>;
  readonly min?: number;
  readonly max?: number;
  readonly default?: readonly JsonValue[] | null;
}

export interface JsonFieldDescription extends FieldPresence {
  readonly type: "json";
  readonly default?: JsonValue;
}

export interface PointValue {
  readonly lat: number;
  readonly lng: number;
}

export interface PointFieldDescription extends FieldPresence {
  readonly type: "point";
  readonly default?: PointValue | null;
}

export type FieldDescription =
  | TextFieldDescription
  | NumberFieldDescription
  | BooleanFieldDescription
  | DateFieldDescription
  | ListFieldDescription
  | ObjectFieldDescription
  | ReferenceFieldDescription
  | BlocksFieldDescription
  | JsonFieldDescription
  | PointFieldDescription;

export interface CollectionDescription {
  readonly fields: Readonly<Record<string, FieldDescription>>;
}

export interface CompiledCollection<Output extends object> {
  validate: (input: unknown) => ValidationResult<Output>;
  describe: () => CollectionDescription;
}

export type CompiledSchema<Outputs extends Record<string, object>> = {
  readonly [Name in keyof Outputs]: CompiledCollection<Outputs[Name]>;
};
