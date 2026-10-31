import type { IssuePath, ValidationIssue } from "./contract.ts";
import { validationIssue } from "./errors.ts";
import type { Outcome } from "./fields.ts";
import { integrityIssues } from "./values.ts";

const maxDepth = 64;

interface Walk {
  readonly issues: ValidationIssue[];
}

function invalid(walk: Walk, path: IssuePath): undefined {
  walk.issues.push(validationIssue(path, { code: "invalid_json" }));
  return undefined;
}

function walkArray(value: unknown[], path: IssuePath, depth: number, walk: Walk): unknown {
  const output: unknown[] = [];
  let valid = !Reflect.ownKeys(value).some(
    (key) =>
      key !== "length" &&
      !(typeof key === "string" && /^(?:0|[1-9]\d*)$/.test(key) && Number(key) < value.length),
  );
  if (!valid) invalid(walk, path);
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, "value")) {
      invalid(walk, [...path, index]);
      valid = false;
      continue;
    }
    output.push(walkValue(descriptor.value, [...path, index], depth, walk));
  }
  return valid ? output : undefined;
}

function walkObject(
  value: Readonly<Record<string, unknown>>,
  path: IssuePath,
  depth: number,
  walk: Walk,
): unknown {
  const keys = Reflect.ownKeys(value);
  const prototype = Object.getPrototypeOf(value);
  if (
    (prototype !== null && prototype !== Object.prototype) ||
    keys.some(
      (key) => typeof key !== "string" || !Object.getOwnPropertyDescriptor(value, key)!.enumerable,
    )
  )
    return invalid(walk, path);
  const output: [string, unknown][] = [];
  for (const key of keys as string[]) {
    walk.issues.push(...integrityIssues(key, path));
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!Object.hasOwn(descriptor, "value")) {
      invalid(walk, [...path, key]);
      continue;
    }
    output.push([key, walkValue(descriptor.value, [...path, key], depth, walk)]);
  }
  return Object.fromEntries(output);
}

function walkValue(value: unknown, path: IssuePath, depth: number, walk: Walk): unknown {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    walk.issues.push(...integrityIssues(value, path));
    return value;
  }
  if (typeof value === "number")
    return Number.isFinite(value) ? (value === 0 ? 0 : value) : invalid(walk, path);
  if (typeof value !== "object") return invalid(walk, path);
  if (depth >= maxDepth) return invalid(walk, path);
  return Array.isArray(value)
    ? walkArray(value, path, depth + 1, walk)
    : walkObject(value as Readonly<Record<string, unknown>>, path, depth + 1, walk);
}

/** Validates a JSON value of up to 64 nested levels and returns a normalized copy. It reads no accessors. */
export function validateJson(value: unknown, path: IssuePath): Outcome {
  const walk: Walk = { issues: [] };
  const output = walkValue(value, path, 0, walk);
  return walk.issues.length ? { ok: false, issues: walk.issues } : { ok: true, value: output };
}
