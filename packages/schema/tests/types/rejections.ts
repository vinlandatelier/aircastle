export interface RejectionCase {
  suite: "contracts" | "inference";
  file: string;
  codes: readonly number[];
  target: string;
  requiresApi?: false;
}

export const rejectionCases: readonly RejectionCase[] = [
  {
    suite: "contracts",
    file: "tests/types/negative/contracts/definition-needs-expected.ts",
    codes: [2322],
    target: "const rejected: SchemaIssue",
  },
  {
    suite: "contracts",
    file: "tests/types/negative/contracts/definition-needs-received.ts",
    codes: [2322],
    target: "const rejected: SchemaIssue",
  },
  {
    suite: "contracts",
    file: "tests/types/negative/contracts/editor-needs-received.ts",
    codes: [2322],
    target: "const rejected: SchemaIssue",
  },
  {
    suite: "contracts",
    file: "tests/types/negative/contracts/definition-kind.ts",
    codes: [2322],
    target: 'expected: "number"',
  },
  {
    suite: "contracts",
    file: "tests/types/negative/contracts/success-has-no-issues.ts",
    codes: [2339],
    target: "result.issues",
  },
  {
    suite: "contracts",
    file: "tests/types/negative/contracts/failure-has-no-data.ts",
    codes: [2339],
    target: "result.data",
  },
  {
    suite: "contracts",
    file: "tests/types/negative/contracts/failure-needs-issues.ts",
    codes: [2322],
    target: "issues: []",
  },
  {
    suite: "contracts",
    file: "tests/types/negative/contracts/choices-empty-has-no-index.ts",
    codes: [2353],
    target: "index: 3",
  },
  {
    suite: "contracts",
    file: "tests/types/negative/contracts/choices-constraints-need-causes.ts",
    codes: [2322],
    target: "const rejected: SchemaIssue",
  },
  {
    suite: "contracts",
    file: "tests/types/negative/contracts/default-needs-causes.ts",
    codes: [2322],
    target: "causes: []",
  },
  {
    suite: "contracts",
    file: "tests/types/negative/contracts/retired-code.ts",
    codes: [2322, 2820],
    target: 'code: "invalid_bounds"',
  },
  {
    suite: "contracts",
    file: "tests/types/negative/contracts/readonly-fields.ts",
    codes: [2542],
    target: "description.fields.title",
  },
  {
    suite: "contracts",
    file: "tests/types/negative/contracts/readonly-field-metadata.ts",
    codes: [2540],
    target: "description.fields.title.required",
  },
  {
    suite: "contracts",
    file: "tests/types/negative/contracts/unknown-collection.ts",
    codes: [2339],
    target: "schema.pages",
  },
  {
    suite: "contracts",
    file: "tests/types/negative/contracts/readonly-schema.ts",
    codes: [2540],
    target: "schema.articles = schema.articles",
  },
  {
    suite: "contracts",
    file: "tests/types/negative/contracts/equality-control.ts",
    requiresApi: false,
    codes: [2344],
    target: "Assert<Equal<string, number>>",
  },
  {
    suite: "contracts",
    file: "tests/types/negative/contracts/any-control.ts",
    requiresApi: false,
    codes: [2344],
    target: "Assert<Equal<IsAny<any>, false>>",
  },
  {
    suite: "inference",
    file: "tests/types/negative/inference/required-default-output.ts",
    codes: [2322, 2741],
    target: "const rejected: Output",
  },
  {
    suite: "inference",
    file: "tests/types/negative/inference/undefined-output.ts",
    codes: [2322, 2375],
    target: "const rejected: Output",
  },
  {
    suite: "inference",
    file: "tests/types/negative/inference/literal-choice.ts",
    codes: [2322],
    target: 'status: "other"',
  },
  {
    suite: "inference",
    file: "tests/types/negative/inference/nullable-is-required.ts",
    codes: [2322, 2741],
    target: "const rejected: Input",
  },
  {
    suite: "inference",
    file: "tests/types/negative/inference/no-coercion.ts",
    codes: [2322],
    target: "title: 7",
  },
  {
    suite: "inference",
    file: "tests/types/negative/inference/optional-default-presence.ts",
    codes: [2322, 2741],
    target: "const rejected: OptionalDefaultDocument",
  },
  {
    suite: "inference",
    file: "tests/types/negative/inference/unknown-inferred-collection.ts",
    codes: [2339],
    target: "schema.pages",
  },
  {
    suite: "inference",
    file: "tests/types/negative/inference/nullable-before-null-default.ts",
    codes: [2345, 2769],
    target: "text().default(null)",
  },
  {
    suite: "inference",
    file: "tests/types/negative/inference/undefined-default.ts",
    codes: [2345, 2769],
    target: "text().default(undefined)",
  },
  {
    suite: "inference",
    file: "tests/types/negative/inference/function-default.ts",
    codes: [2345, 2769],
    target: 'text().default(() => "draft")',
  },
];
