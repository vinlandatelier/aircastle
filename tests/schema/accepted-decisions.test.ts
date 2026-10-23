import { beforeAll, describe, expect, test } from "bun:test";
import type { ReceivedType } from "../../src/index.ts";
import {
  compileCollection,
  requireSchemaApi,
  type RuntimeApi,
  type RuntimeText,
} from "../support/api.ts";
import {
  expectFailure,
  expectOwnKeys,
  expectSchemaError,
  expectSuccess,
} from "../support/assertions.ts";

describe("approved declaration and metadata decisions", () => {
  let api: RuntimeApi;
  beforeAll(() => {
    api = requireSchemaApi();
  });
  const path = ["articles", "title"];

  for (const configure of [
    (t: RuntimeText) => t,
    (t: RuntimeText) => t.optional(),
    (t: RuntimeText) => t.nullable(),
  ]) {
    test(`undefined default is invalid before presence resolution: ${configure.toString()}`, () => {
      const field = configure(api.text()).default(undefined as unknown as string);
      expectSchemaError(
        () => compileCollection(api, { title: field }),
        [
          {
            code: "invalid_default",
            path,
            causes: [{ code: "invalid_type", path, expected: "string", received: "undefined" }],
          },
        ],
      );
    });
  }

  test("function defaults are rejected without invocation", () => {
    let calls = 0;
    const value = () => {
      calls++;
      return "Generated";
    };
    const field = api.text().default(value as unknown as string);
    expectSchemaError(
      () => compileCollection(api, { title: field }),
      [
        {
          code: "invalid_default",
          path,
          causes: [{ code: "invalid_type", path, expected: "string", received: "function" }],
        },
      ],
    );
    expect(calls).toBe(0);
  });

  test("invalid bounds are deduplicated per constraint and ordered min then max", () => {
    const field = api.text().max(-1).min(-1).max(-2).min(NaN).default("Valid text");
    expectSchemaError(
      () => compileCollection(api, { title: field }),
      [
        { code: "invalid_bound", path, constraint: "min" },
        { code: "invalid_bound", path, constraint: "max" },
      ],
    );
  });

  test("an invalid minimum does not hide a default violating an independent maximum", () => {
    const field = api.text().min(-1).max(2).default("long");
    expectSchemaError(
      () => compileCollection(api, { title: field }),
      [
        { code: "invalid_bound", path, constraint: "min" },
        {
          code: "invalid_default",
          path,
          causes: [{ code: "too_long", path, maximum: 2, actual: 4, unit: "graphemes" }],
        },
      ],
    );
  });

  test("contradictory bounds suppress checks against the invalid range", () => {
    const field = api.text().min(6).max(3).default("abcd");
    expectSchemaError(
      () => compileCollection(api, { title: field }),
      [{ code: "conflicting_bounds", path, minimum: 6, maximum: 3 }],
    );
  });

  test("conflicted choices and formats suppress their dependent default checks", () => {
    const choices = api.text().oneOf(["a"]).oneOf(["b"]).default("c");
    const format = api.text().email().url().default("not a formatted value");
    expectSchemaError(
      () => compileCollection(api, { title: choices }),
      [{ code: "conflicting_choices", path }],
    );
    expectSchemaError(
      () => compileCollection(api, { title: format }),
      [{ code: "conflicting_formats", path }],
    );
  });

  const badArguments: [ReceivedType, unknown][] = [
    ["null", null],
    ["undefined", undefined],
    ["number", 3],
    ["boolean", false],
    ["object", {}],
    ["array", []],
    ["symbol", Symbol("editor")],
    ["function", () => "code"],
  ];
  for (const [received, value] of badArguments) {
    test(`a non-string editor name reports its type: ${received}`, () => {
      const field = api.text().editor(value as string, { unsupported: true });
      expectSchemaError(
        () => compileCollection(api, { title: field }),
        [{ code: "invalid_editor", path, expected: "string", received }],
      );
    });
  }

  test("plain input metadata omits editor", () => {
    const field = compileCollection(api, { title: api.text() }).describe().fields.title!;
    expect(field).toEqual({ type: "text", required: true, nullable: false, unique: false });
    expectOwnKeys(field, ["type", "required", "nullable", "unique"]);
  });

  test("explicit and implicit editor defaults are equivalent", () => {
    const cases = [
      {
        field: api.text().editor("textarea").editor("textarea", { rows: 4 }),
        baseline: api.text().editor("textarea"),
        editor: { type: "textarea", rows: 4 },
      },
      {
        field: api.text().editor("code", { language: "plaintext" }).editor("code"),
        baseline: api.text().editor("code"),
        editor: { type: "code", language: "plaintext" },
      },
      {
        field: api.text().oneOf(["a"]).editor("radio").editor("radio", {}),
        baseline: api.text().oneOf(["a"]).editor("radio"),
        editor: { type: "radio" },
      },
    ] as const;
    for (const entry of cases) {
      const collection = compileCollection(api, { title: entry.field });
      const baseline = compileCollection(api, { title: entry.baseline });
      expect(collection.describe().fields.title!.editor).toEqual(entry.editor);
      expect(collection.describe()).toEqual(baseline.describe());
      expectSuccess(collection.validate({ title: "a" }), { title: "a" });
      expectFailure(collection.validate({ title: 42 }), [
        { code: "invalid_type", path: ["title"], expected: "string", received: "number" },
      ]);
    }
  });

  test("returned description mutation cannot change the compiled schema", () => {
    const collection = compileCollection(api, {
      title: api.text().min(2).oneOf(["draft", "published"]).default("draft").editor("textarea"),
    });
    const initial = collection.describe();
    const expected = JSON.parse(JSON.stringify(initial));
    const field = initial.fields.title!;
    Reflect.set(field, "default", "changed");
    Reflect.set(field, "nullable", true);
    Reflect.set(field.choices!, "0", "changed");
    Reflect.set(field.editor!, "rows", 99);
    Reflect.deleteProperty(initial.fields, "title");
    expect(collection.describe()).toEqual(expected);
    expectSuccess(collection.validate({}), { title: "draft" });
    expectFailure(collection.validate({ title: "changed" }), [
      { code: "invalid_choice", path: ["title"], allowed: ["draft", "published"] },
    ]);
  });
});

describe("approved configuration boundaries and names", () => {
  let api: RuntimeApi;
  beforeAll(() => {
    api = requireSchemaApi();
  });

  const invalidRecords: [ReceivedType, unknown][] = [
    ["null", null],
    ["undefined", undefined],
    ["array", []],
    ["string", "not a record"],
  ];
  for (const [received, value] of invalidRecords) {
    test(`malformed schema map reports record/${received}`, () => {
      expectSchemaError(
        () => api.compileSchema(value as Parameters<RuntimeApi["compileSchema"]>[0]),
        [{ code: "invalid_definition", path: [], expected: "record", received }],
      );
    });
    test(`malformed field map reports record/${received}`, () => {
      const declaration = api.collection(value as Parameters<RuntimeApi["collection"]>[0]);
      expectSchemaError(
        () => api.compileSchema({ articles: declaration }),
        [{ code: "invalid_definition", path: ["articles"], expected: "record", received }],
      );
    });
  }

  test("arbitrary objects cannot impersonate collection or field declarations", () => {
    expectSchemaError(
      () => api.compileSchema({ articles: {} }),
      [
        {
          code: "invalid_definition",
          path: ["articles"],
          expected: "collection",
          received: "object",
        },
      ],
    );
    const declaration = api.collection({ title: {} as RuntimeText });
    expectSchemaError(
      () => api.compileSchema({ articles: declaration }),
      [
        {
          code: "invalid_definition",
          path: ["articles", "title"],
          expected: "field",
          received: "object",
        },
      ],
    );
  });

  test("empty schemas and collections are valid", () => {
    expect(Object.keys(api.compileSchema({}))).toEqual([]);
    const collection = compileCollection(api, {});
    expectSuccess(collection.validate({}), {});
    expect(collection.describe()).toEqual({ fields: {} });
    expectFailure(collection.validate({ unknown: true }), [
      { code: "unknown_field", path: ["unknown"] },
    ]);
  });

  for (const name of ["", "__proto__", "constructor", "toString", "10", "é", "e\u0301"]) {
    test(`collection and field names are safe own keys: ${JSON.stringify(name)}`, () => {
      const fields = Object.fromEntries([[name, api.text()]]);
      const schema = api.compileSchema(Object.fromEntries([[name, api.collection(fields)]]));
      expect(Object.hasOwn(schema, name)).toBe(true);
      const input = Object.fromEntries([[name, "Kept"]]);
      const inputPrototype = Object.getPrototypeOf(input);
      expectSuccess(schema[name]!.validate(input), Object.fromEntries([[name, "Kept"]]));
      expect(Object.getPrototypeOf(input)).toBe(inputPrototype);
      expect(Object.hasOwn(schema[name]!.describe().fields, name)).toBe(true);
    });
  }

  test("declared fields follow JavaScript own-key order", () => {
    const fields = { "10": api.text(), "2": api.text(), alpha: api.text(), "01": api.text() };
    expectFailure(compileCollection(api, fields).validate({}), [
      { code: "required", path: ["2"] },
      { code: "required", path: ["10"] },
      { code: "required", path: ["alpha"] },
      { code: "required", path: ["01"] },
    ]);
  });

  test("unknown names follow UTF-16 lexical order, independently of locale", () => {
    const input = Object.fromEntries(
      ["\uE000", "😀", "ä", "z", "a", "A", "2", "10"].map((name) => [name, true]),
    );
    expectFailure(compileCollection(api, {}).validate(input), [
      { code: "unknown_field", path: ["10"] },
      { code: "unknown_field", path: ["2"] },
      { code: "unknown_field", path: ["A"] },
      { code: "unknown_field", path: ["a"] },
      { code: "unknown_field", path: ["z"] },
      { code: "unknown_field", path: ["ä"] },
      { code: "unknown_field", path: ["😀"] },
      { code: "unknown_field", path: ["\uE000"] },
    ]);
  });
});
