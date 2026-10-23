import { beforeAll, describe, expect, test } from "bun:test";
import { compileCollection, requireSchemaApi, type RuntimeApi, type RuntimeText } from "../support/api.ts";
import { expectFailure, expectSuccess } from "../support/assertions.ts";

describe("presence and defaults", () => {
  let api: RuntimeApi;
  beforeAll(() => { api = requireSchemaApi(); });

  const required = Symbol("required");
  const omitted = Symbol("omitted");
  const wrongNull = Symbol("wrong null");
  type Answer = string | null | typeof required | typeof omitted | typeof wrongNull;
  // Independent finite oracle from the accepted presence/default rules.
  const rows: { name: string; field: (text: RuntimeText) => RuntimeText; answers: Answer[] }[] = [
    { name: "required", field: (t) => t, answers: [required, required, wrongNull, "", "Hi"] },
    { name: "optional", field: (t) => t.optional(), answers: [omitted, omitted, wrongNull, "", "Hi"] },
    { name: "nullable", field: (t) => t.nullable(), answers: [required, required, null, "", "Hi"] },
    { name: "optional nullable", field: (t) => t.optional().nullable(), answers: [omitted, omitted, null, "", "Hi"] },
    { name: "default", field: (t) => t.default("New"), answers: ["New", "New", wrongNull, "", "Hi"] },
    { name: "optional then default", field: (t) => t.optional().default("New"), answers: ["New", "New", wrongNull, "", "Hi"] },
    { name: "default then optional", field: (t) => t.default("New").optional(), answers: ["New", "New", wrongNull, "", "Hi"] },
    { name: "nullable default", field: (t) => t.nullable().default("New"), answers: ["New", "New", null, "", "Hi"] },
    { name: "nullable optional default", field: (t) => t.nullable().optional().default("New"), answers: ["New", "New", null, "", "Hi"] },
    { name: "null default", field: (t) => t.nullable().default(null), answers: [null, null, null, "", "Hi"] },
    { name: "optional null default", field: (t) => t.nullable().default(null).optional(), answers: [null, null, null, "", "Hi"] },
  ];
  const inputs = [
    { name: "absent", value: {} },
    { name: "undefined", value: { title: undefined } },
    { name: "null", value: { title: null } },
    { name: "empty", value: { title: "" } },
    { name: "supplied", value: { title: "Hi" } },
  ];

  for (const row of rows) {
    inputs.forEach((input, index) => {
      test(`${row.name} with ${input.name}`, () => {
        const collection = compileCollection(api, { title: row.field(api.text()) });
        const before = Object.getOwnPropertyDescriptors(input.value);
        const result = collection.validate(input.value);
        const answer = row.answers[index];
        if (answer === required) expectFailure(result, [{ code: "required", path: ["title"] }]);
        else if (answer === wrongNull) expectFailure(result, [{ code: "invalid_type", path: ["title"], expected: "string", received: "null" }]);
        else if (answer === omitted) expectSuccess(result, {});
        else expectSuccess(result, { title: answer });
        expect(Object.getOwnPropertyDescriptors(input.value)).toEqual(before);
      });
    });
  }

  test("supplied invalid data is not replaced with a default", () => {
    const collection = compileCollection(api, { title: api.text().min(3).default("Good") });
    expectFailure(collection.validate({ title: "x" }), [{ code: "too_short", path: ["title"], minimum: 3, actual: 1, unit: "graphemes" }]);
    expectFailure(collection.validate({ title: 42 }), [{ code: "invalid_type", path: ["title"], expected: "string", received: "number" }]);
  });

  test("allowed null skips all string-only constraints", () => {
    const collection = compileCollection(api, {
      title: api.text().min(10).email().oneOf(["ada@example.com"]).nullable(),
    });
    expectSuccess(collection.validate({ title: null }), { title: null });
  });

  test("frozen inputs work without default insertion or undefined deletion on the caller", () => {
    const input = Object.freeze({ subtitle: undefined });
    const collection = compileCollection(api, { title: api.text().default("New"), subtitle: api.text().optional() });
    expectSuccess(collection.validate(input), { title: "New" });
    expect(Reflect.ownKeys(input)).toEqual(["subtitle"]);
    expect(input.subtitle).toBeUndefined();
  });
});
