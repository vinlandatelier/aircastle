import { describe, expect, test } from "vite-plus/test";
import { collection, compileSchema, text, type CodeLanguage } from "../../src/index.ts";
import {
  compileCollection,
  type FieldDeclaration,
  type TextBuilder,
} from "../support/collections.ts";
import {
  expectSchemaError,
  expectSuccess,
  type ExpectedSchemaIssue,
} from "../support/assertions.ts";

describe("declaration compilation", () => {
  const path = ["articles", "title"];

  for (const constraint of ["min", "max"] as const) {
    test.for(
      [
        -1,
        1.5,
        NaN,
        Infinity,
        -Infinity,
        Number.MAX_SAFE_INTEGER + 1,
        "3",
        null,
        undefined,
        true,
        1n,
        {},
      ].map((value) => [value]),
    )(`rejects ${constraint} bound %o during compilation`, ([invalid]) => {
      const field = text()[constraint](invalid as number);
      expectSchemaError(
        () => compileCollection({ title: field }),
        [{ code: "invalid_bound", path, constraint }],
      );
    });
    test(`does not discard an invalid ${constraint} when followed by a valid bound`, () => {
      const field = text()[constraint](-1)[constraint](3);
      expectSchemaError(
        () => compileCollection({ title: field }),
        [{ code: "invalid_bound", path, constraint }],
      );
    });
  }

  test("safe integer and zero bounds compile without enormous string allocation", () => {
    expect(() => compileCollection({ title: text().max(Number.MAX_SAFE_INTEGER) })).not.toThrow();
    expect(() => compileCollection({ title: text().min(Number.MAX_SAFE_INTEGER) })).not.toThrow();
    expectSuccess(compileCollection({ title: text().min(0).max(0) }).validate({ title: "" }), {
      title: "",
    });
  });

  test("aggregates independent errors in collection and field declaration order", () => {
    const articles = collection({
      title: text().min(6).max(3),
      subtitle: text().default("Hi").min(3),
    });
    const pages = collection({ heading: text().oneOf(["a", "a"]) });
    expectSchemaError(
      () => compileSchema({ articles, pages }),
      [
        { code: "conflicting_bounds", path, minimum: 6, maximum: 3 },
        {
          code: "invalid_default",
          path: ["articles", "subtitle"],
          causes: [
            {
              code: "too_short",
              path: ["articles", "subtitle"],
              minimum: 3,
              actual: 2,
              unit: "graphemes",
            },
          ],
        },
        { code: "duplicate_choice", path: ["pages", "heading"], index: 1, firstIndex: 0 },
      ],
    );
  });

  const invalidDeclarations: {
    name: string;
    build: (text: TextBuilder) => FieldDeclaration;
    issues: ExpectedSchemaIssue[];
  }[] = [
    {
      name: "different defaults",
      build: (t) => t.default("one").default("two"),
      issues: [{ code: "conflicting_defaults", path }],
    },
    {
      name: "different formats",
      build: (t) => t.email().url(),
      issues: [{ code: "conflicting_formats", path }],
    },
    {
      name: "reordered repeated choices",
      build: (t) => t.oneOf(["a", "b"]).oneOf(["b", "a"]),
      issues: [{ code: "conflicting_choices", path }],
    },
    {
      name: "different editors",
      build: (t) => t.editor("textarea").editor("code"),
      issues: [{ code: "conflicting_editors", path }],
    },
    {
      name: "unknown editor",
      build: (t) => t.editor("unknown" as "textarea"),
      issues: [{ code: "unknown_editor", path, editor: "unknown" }],
    },
    {
      name: "empty choices",
      build: (t) => t.oneOf([]),
      issues: [{ code: "invalid_choices", path, reason: "empty" }],
    },
    {
      name: "nonstring choices",
      build: (t) => t.oneOf([42] as unknown as string[]),
      issues: [{ code: "invalid_choices", path, reason: "invalid_type", index: 0 }],
    },
    {
      name: "holes in a sparse choice list",
      build: (t) => {
        const sparse: string[] = [];
        sparse[0] = "a";
        sparse[2] = "b";
        return t.oneOf(sparse);
      },
      issues: [{ code: "invalid_choices", path, reason: "invalid_type", index: 1 }],
    },
    {
      name: "an array choice list repeated as a non-array value",
      build: (t) => t.oneOf(["a"]).oneOf("a" as unknown as string[]),
      issues: [{ code: "conflicting_choices", path }],
    },
    {
      name: "an array-wrapped code language",
      build: (t) => t.editor("code", { language: ["sql"] as unknown as CodeLanguage }),
      issues: [
        { code: "invalid_editor_options", path, option: "language", reason: "invalid_value" },
      ],
    },
    {
      name: "duplicate choices",
      build: (t) => t.oneOf(["a", "b", "a"]),
      issues: [{ code: "duplicate_choice", path, index: 2, firstIndex: 0 }],
    },
    {
      name: "choices violating final constraints",
      build: (t) => t.oneOf(["a"]).min(2),
      issues: [
        {
          code: "invalid_choices",
          path,
          reason: "violates_constraints",
          index: 0,
          causes: [{ code: "too_short", path, minimum: 2, actual: 1, unit: "graphemes" }],
        },
      ],
    },
    {
      name: "default outside choices",
      build: (t) => t.default("other").oneOf(["draft"]),
      issues: [
        {
          code: "invalid_default",
          path,
          causes: [{ code: "invalid_choice", path, allowed: ["draft"] }],
        },
      ],
    },
    {
      name: "default violates final format",
      build: (t) => t.default("invalid").email(),
      issues: [{ code: "invalid_default", path, causes: [{ code: "invalid_email", path }] }],
    },
    {
      name: "default contains NUL",
      build: (t) => t.default("a\u0000"),
      issues: [{ code: "invalid_default", path, causes: [{ code: "invalid_character", path }] }],
    },
    {
      name: "default contains lone surrogate",
      build: (t) => t.default("\uD800"),
      issues: [{ code: "invalid_default", path, causes: [{ code: "invalid_unicode", path }] }],
    },
  ];
  for (const entry of invalidDeclarations) {
    test(entry.name, () => {
      const field = entry.build(text());
      expectSchemaError(() => compileCollection({ title: field }), entry.issues);
    });
  }

  test("identical repeated modifiers are harmless", () => {
    const field = text()
      .min(1)
      .min(1)
      .max(10)
      .max(10)
      .optional()
      .optional()
      .nullable()
      .nullable()
      .oneOf(["a", "b"])
      .oneOf(["a", "b"])
      .default("a")
      .default("a")
      .unique()
      .unique()
      .editor("radio")
      .editor("radio");
    expectSuccess(compileCollection({ title: field }).validate({}), { title: "a" });
    const email = text().email().email().default("ada@example.com");
    expectSuccess(compileCollection({ title: email }).validate({}), {
      title: "ada@example.com",
    });
    const url = text().url().url();
    expectSuccess(compileCollection({ title: url }).validate({ title: "https://example.com" }), {
      title: "https://example.com",
    });
  });

  test("independent configuration codes follow precedence, not chain order", () => {
    const field = text().editor("code").editor("textarea").default("one").default("two");
    expectSchemaError(
      () => compileCollection({ title: field }),
      [
        { code: "conflicting_defaults", path },
        { code: "conflicting_editors", path },
      ],
    );
  });

  test("partially overlapping and prefix choice declarations conflict", () => {
    for (const choices of [["a"], ["a", "c"], ["a", "b", "c"]]) {
      expectSchemaError(
        () => compileCollection({ title: text().oneOf(["a", "b"]).oneOf(choices) }),
        [{ code: "conflicting_choices", path }],
      );
    }
  });

  test("different options on the same editor conflict", () => {
    for (const field of [
      text().editor("textarea", { rows: 3 }).editor("textarea", { rows: 5 }),
      text().editor("code", { language: "sql" }).editor("code", { language: "json" }),
      text().oneOf(["a"]).editor("radio").editor("code"),
    ]) {
      expectSchemaError(
        () => compileCollection({ title: field }),
        [{ code: "conflicting_editors", path }],
      );
    }
  });

  test("editor options must be a plain data record", () => {
    for (const options of [
      null,
      [],
      new Date(),
      Object.defineProperty({}, "rows", {
        enumerable: true,
        get() {
          throw new Error("Getter must not run");
        },
      }),
    ]) {
      expectSchemaError(
        () =>
          compileCollection({
            title: text().editor("textarea", options as unknown as Record<string, unknown>),
          }),
        [{ code: "invalid_editor_options", path, option: "options", reason: "invalid_value" }],
      );
    }
  });

  test("choice constraint diagnostics contain every cause exactly once", () => {
    expectSchemaError(
      () => compileCollection({ title: text().min(2).email().oneOf(["a"]) }),
      [
        {
          code: "invalid_choices",
          path,
          reason: "violates_constraints",
          index: 0,
          causes: [
            { code: "too_short", path, minimum: 2, actual: 1, unit: "graphemes" },
            { code: "invalid_email", path },
          ],
        },
      ],
    );
  });

  test("invalid choices suppress default membership errors", () => {
    const cases: { field: FieldDeclaration; issues: ExpectedSchemaIssue[] }[] = [
      {
        field: text()
          .oneOf([42] as unknown as string[])
          .default("ok"),
        issues: [{ code: "invalid_choices", path, reason: "invalid_type", index: 0 }],
      },
      {
        field: text()
          .min(2)
          .oneOf(["a"])
          .default("ok" as "a"),
        issues: [
          {
            code: "invalid_choices",
            path,
            reason: "violates_constraints",
            index: 0,
            causes: [{ code: "too_short", path, minimum: 2, actual: 1, unit: "graphemes" }],
          },
        ],
      },
      {
        field: text()
          .oneOf(["a", "a"])
          .default("b" as "a"),
        issues: [{ code: "duplicate_choice", path, index: 1, firstIndex: 0 }],
      },
    ];
    for (const { field, issues } of cases)
      expectSchemaError(() => compileCollection({ title: field }), issues);
  });

  test("editor conflicts precede invalid bounds regardless of discovery order", () => {
    expectSchemaError(
      () => compileCollection({ title: text().min(-1).editor("code").editor("textarea") }),
      [
        { code: "conflicting_editors", path },
        { code: "invalid_bound", path, constraint: "min" },
      ],
    );
  });

  test("does not echo invalid default content in diagnostics", () => {
    const secret = "private-default-value-marker";
    const field = text().default(secret).max(0);
    try {
      compileCollection({ title: field });
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      const details = error as Error & { issues: unknown };
      expect(details.name).toBe("SchemaError");
      expect(JSON.stringify({ message: details.message, issues: details.issues })).not.toContain(
        secret,
      );
      return;
    }
    throw new Error("Expected invalid default compilation to fail");
  });

  test("a non-array choice list is one whole-value issue without an element index", () => {
    expectSchemaError(
      () => compileCollection({ title: text().oneOf("draft" as unknown as string[]) }),
      [{ code: "invalid_choices", path, reason: "invalid_type" }],
    );
  });

  test("field builders and collection declarations are frozen", () => {
    const field = text();
    for (const value of [field, field.min(1), collection({ title: field })]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
  });
});
