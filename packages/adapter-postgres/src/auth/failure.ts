import postgres from "postgres";
import { AuthStorageError } from "@aircastle/core";

/** postgres.js codes for a connection or server that failed. Its other codes are programming errors. */
const connectionCodes = new Set([
  "CONNECTION_CLOSED",
  "CONNECTION_DESTROYED",
  "CONNECTION_ENDED",
  "CONNECT_TIMEOUT",
  "MESSAGE_NOT_SUPPORTED",
  "SASL_SIGNATURE_MISMATCH",
]);

/**
 * TLS handshake failures that carry no `syscall`, in Node and Bun alike: a socket reset before the
 * handshake finished, a certificate for another host, and the certificate verification codes at
 * https://nodejs.org/api/tls.html#x509-certificate-error-codes. OpenSSL errors carry a `library`.
 */
const tlsCodes = new Set([
  "ECONNRESET",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_CRL",
  "UNABLE_TO_DECRYPT_CERT_SIGNATURE",
  "UNABLE_TO_DECRYPT_CRL_SIGNATURE",
  "UNABLE_TO_DECODE_ISSUER_PUBLIC_KEY",
  "CERT_SIGNATURE_FAILURE",
  "CRL_SIGNATURE_FAILURE",
  "CERT_NOT_YET_VALID",
  "CERT_HAS_EXPIRED",
  "CRL_NOT_YET_VALID",
  "CRL_HAS_EXPIRED",
  "ERROR_IN_CERT_NOT_BEFORE_FIELD",
  "ERROR_IN_CERT_NOT_AFTER_FIELD",
  "ERROR_IN_CRL_LAST_UPDATE_FIELD",
  "ERROR_IN_CRL_NEXT_UPDATE_FIELD",
  "OUT_OF_MEM",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "CERT_CHAIN_TOO_LONG",
  "CERT_REVOKED",
  "INVALID_CA",
  "PATH_LENGTH_EXCEEDED",
  "INVALID_PURPOSE",
  "CERT_UNTRUSTED",
  "CERT_REJECTED",
  "HOSTNAME_MISMATCH",
]);

/**
 * True for errors the driver raises about the database: SQL errors, postgres.js connection failures,
 * and the socket and TLS errors it passes through, alone or grouped when a host name has several
 * addresses. Other coded errors, such as Node's `ERR_` errors, are bugs.
 */
export function isDriverError(error: unknown): error is Error {
  if (error instanceof AuthStorageError) return false;
  if (error instanceof postgres.PostgresError) return true;
  if (error instanceof AggregateError)
    return error.errors.length > 0 && error.errors.every(isDriverError);
  if (!(error instanceof Error) || !("code" in error) || typeof error.code !== "string")
    return false;
  return (
    connectionCodes.has(error.code) ||
    tlsCodes.has(error.code) ||
    ("syscall" in error && typeof error.syscall === "string") ||
    ("library" in error && typeof error.library === "string")
  );
}

/** Wraps a driver error, keeping it as the cause and its SQLSTATE or connection code for diagnostics. */
export function storageFailure(kind: AuthStorageError["kind"], error: Error): AuthStorageError {
  return new AuthStorageError(kind, {
    cause: error,
    ...("code" in error && typeof error.code === "string" ? { code: error.code } : {}),
  });
}
