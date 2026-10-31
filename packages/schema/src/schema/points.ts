import type { IssuePath, ValidationIssue } from "./contract.ts";
import { validationIssue } from "./errors.ts";
import type { Outcome } from "./fields.ts";
import { receivedType, snapshotRecord } from "./records.ts";

const limits = { lat: 90, lng: 180 } as const;

export function validatePoint(value: unknown, path: IssuePath): Outcome {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return {
      ok: false,
      issues: [
        validationIssue(path, {
          code: "invalid_type",
          expected: "object",
          received: receivedType(value),
        }),
      ],
    };
  const snapshot = snapshotRecord(value);
  const entries = snapshot.ok ? new Map(snapshot.entries) : undefined;
  const lat = entries?.get("lat");
  const lng = entries?.get("lng");
  if (
    entries?.size !== 2 ||
    typeof lat !== "number" ||
    !Number.isFinite(lat) ||
    typeof lng !== "number" ||
    !Number.isFinite(lng)
  )
    return { ok: false, issues: [validationIssue(path, { code: "invalid_point" })] };
  const issues: ValidationIssue[] = [];
  for (const [name, actual] of [
    ["lat", lat],
    ["lng", lng],
  ] as const) {
    const limit = limits[name];
    if (actual < -limit || actual > limit)
      issues.push(
        validationIssue([...path, name], {
          code: "out_of_range",
          minimum: -limit,
          maximum: limit,
          actual,
        }),
      );
  }
  return issues.length
    ? { ok: false, issues }
    : { ok: true, value: { lat: lat === 0 ? 0 : lat, lng: lng === 0 ? 0 : lng } };
}
