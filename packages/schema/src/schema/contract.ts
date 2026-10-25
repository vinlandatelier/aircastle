export type IssuePath = readonly (string | number)[];

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
          | "unknown_field";
      }
    | {
        readonly code: "invalid_type";
        readonly expected: "string";
        readonly received: ReceivedType;
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
        readonly minimum: number;
        readonly maximum: number;
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

export interface TextFieldDescription {
  readonly type: "text";
  /** Whether the caller must supply this field, before defaults. */
  readonly required: boolean;
  readonly nullable: boolean;
  readonly unique: boolean;
  readonly min?: number;
  readonly max?: number;
  readonly choices?: readonly string[];
  readonly default?: string | null;
  readonly format?: "email" | "url";
  /** Explicit editor metadata; omitted for the plain text input. */
  readonly editor?: TextEditorDescription;
}

export interface CollectionDescription {
  readonly fields: Readonly<Record<string, TextFieldDescription>>;
}

export interface CompiledCollection<Output extends object> {
  validate: (input: unknown) => ValidationResult<Output>;
  describe: () => CollectionDescription;
}

export type CompiledSchema<Outputs extends Record<string, object>> = {
  readonly [Name in keyof Outputs]: CompiledCollection<Outputs[Name]>;
};
