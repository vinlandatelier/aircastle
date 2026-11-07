import postgres from "postgres";
import { AuthStorageError } from "@aircastle/core";

/** True for errors the driver raises: SQL errors and connection failures, which carry a string code. */
export function isDriverError(error: unknown): error is Error {
  if (error instanceof AuthStorageError) return false;
  return (
    error instanceof postgres.PostgresError ||
    (error instanceof Error && "code" in error && typeof error.code === "string")
  );
}

/** Wraps a driver error, keeping it as the cause and its SQLSTATE or connection code for diagnostics. */
export function storageFailure(kind: AuthStorageError["kind"], error: Error): AuthStorageError {
  return new AuthStorageError(kind, {
    cause: error,
    ...("code" in error && typeof error.code === "string" ? { code: error.code } : {}),
  });
}
