import type { ReceivedType } from "./contract.ts";

export type RecordSnapshot =
  | { readonly ok: true; readonly entries: readonly (readonly [string, unknown])[] }
  | { readonly ok: false; readonly received: ReceivedType };

export function receivedType(value: unknown): ReceivedType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

export function snapshotRecord(value: unknown): RecordSnapshot {
  if (value === null || typeof value !== "object")
    return { ok: false, received: receivedType(value) };
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== null && prototype !== Object.prototype)
    return { ok: false, received: receivedType(value) };
  const entries: (readonly [string, unknown])[] = [];
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") return { ok: false, received: "object" };
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value"))
      return { ok: false, received: "object" };
    entries.push(Object.freeze([key, descriptor.value] as const));
  }
  return { ok: true, entries: Object.freeze(entries) };
}

export function snapshotChoices(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  const values: unknown[] = [];
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    values.push(descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined);
  }
  return Object.freeze(values);
}
