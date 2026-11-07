import postgres from "postgres";
import { AuthStorageError } from "@aircastle/core";

const connectionCodes = new Set([
  "CONNECTION_CLOSED",
  "CONNECTION_DESTROYED",
  "CONNECTION_ENDED",
  "CONNECT_TIMEOUT",
]);

/**
 * True for errors the driver raises about the database: SQL errors, postgres.js connection failures,
 * and the socket errors it passes through, alone or grouped when a host name has several addresses.
 * Other coded errors, such as Node's `ERR_` errors, are bugs.
 */
export function isDriverError(error: unknown): error is Error {
  if (error instanceof AuthStorageError) return false;
  if (error instanceof postgres.PostgresError) return true;
  if (error instanceof AggregateError)
    return error.errors.length > 0 && error.errors.every(isDriverError);
  if (!(error instanceof Error) || !("code" in error) || typeof error.code !== "string")
    return false;
  return (
    connectionCodes.has(error.code) || ("syscall" in error && typeof error.syscall === "string")
  );
}

/** Wraps a driver error, keeping it as the cause and its SQLSTATE or connection code for diagnostics. */
export function storageFailure(kind: AuthStorageError["kind"], error: Error): AuthStorageError {
  return new AuthStorageError(kind, {
    cause: error,
    ...("code" in error && typeof error.code === "string" ? { code: error.code } : {}),
  });
}
