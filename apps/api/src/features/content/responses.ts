import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ContentError, Result } from "@aircastle/contracts";
import { ErrorSummary } from "@aircastle/core";

const statuses: Record<ContentError["code"], ContentfulStatusCode> = {
  invalid_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  validation_failed: 422,
  unique_conflict: 409,
  schema_mismatch: 409,
  schema_conflict: 409,
  migration_required: 409,
  payload_too_large: 413,
  internal_error: 500,
  unavailable: 503,
  transport_error: 503,
  unknown_write_outcome: 500,
};

export function failure(
  code: Exclude<ContentError["code"], "validation_failed" | "unique_conflict">,
): Result<never> {
  return { ok: false, error: { code } };
}

export function reply(c: Context, result: Result<unknown>, success: ContentfulStatusCode = 200) {
  return c.json(result, result.ok ? success : statuses[result.error.code]);
}

export function unexpectedError(error: Error, c: Context) {
  c.error = ErrorSummary.of(error);
  return reply(c, failure("internal_error"));
}
