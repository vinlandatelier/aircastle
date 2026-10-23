import { expect } from "vite-plus/test";
import type { SchemaIssue, ValidationIssue } from "../../src/index.ts";

type ExpectedIssue<Issue> = Issue extends { message: string }
  ? Omit<Issue, "message" | "causes"> & {
      causes?: readonly ExpectedIssue<ValidationIssue>[];
    }
  : never;

export type ExpectedValidationIssue = ExpectedIssue<ValidationIssue>;
export type ExpectedSchemaIssue = ExpectedIssue<SchemaIssue>;

function record(value: unknown): Record<string, unknown> {
  expect(value).not.toBeNull();
  expect(typeof value).toBe("object");
  expect(Array.isArray(value)).toBe(false);
  return value as Record<string, unknown>;
}

export function expectOwnKeys(value: object, expected: readonly string[]): void {
  expect(Reflect.ownKeys(value).sort()).toEqual([...expected].sort());
}

export function expectData(actual: unknown, expected: Record<string, unknown>): void {
  const data = record(actual);
  expectOwnKeys(data, Object.keys(expected));
  for (const key of Object.keys(expected)) {
    expect(Object.hasOwn(data, key)).toBe(true);
    expect(data[key]).toEqual(expected[key]);
  }
}

export function expectSuccess(actual: unknown, expected: Record<string, unknown>): void {
  const result = record(actual);
  expectOwnKeys(result, ["ok", "data"]);
  expect(result.ok).toBe(true);
  expectData(result.data, expected);
}

function expectIssues(
  actual: unknown,
  expected: readonly (ExpectedValidationIssue | ExpectedSchemaIssue)[],
): void {
  expect(Array.isArray(actual)).toBe(true);
  const issues = actual as unknown[];
  expect(issues.length).toBeGreaterThan(0);
  expect(issues).toHaveLength(expected.length);
  expected.forEach((wanted, index) => {
    const issue = record(issues[index]);
    expect(typeof issue.message).toBe("string");
    expect((issue.message as string).trim().length).toBeGreaterThan(0);
    for (const [key, value] of Object.entries(wanted)) {
      expect(Object.hasOwn(issue, key)).toBe(true);
      if (key === "causes") expectIssues(issue[key], value as ExpectedValidationIssue[]);
      else expect(issue[key]).toEqual(value);
    }
  });
}

export function expectFailure(actual: unknown, expected: readonly ExpectedValidationIssue[]): void {
  const result = record(actual);
  expectOwnKeys(result, ["ok", "issues"]);
  expect(result.ok).toBe(false);
  expectIssues(result.issues, expected);
}

export function expectSchemaError(
  action: () => unknown,
  expected: readonly ExpectedSchemaIssue[],
): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(Error);
  const error = thrown as Error & { issues: unknown };
  expect(error.name).toBe("SchemaError");
  expect(error.message.trim().length).toBeGreaterThan(0);
  expectIssues(error.issues, expected);
}
