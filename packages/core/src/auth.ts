export interface AuthLimits {
  email: { fiveMinutes: number; oneHour: number };
  ip: { fiveMinutes: number; oneHour: number };
  global: { fiveMinutes: number; oneHour: number };
}

export type AuthLimitScope = "email" | "ip" | "global";

export type AuthAdmission =
  | { kind: "admitted" }
  | { kind: "throttled"; retryAt: number; scopes: AuthLimitScope[] };

export interface AuthAdmissionStore {
  admit: (request: { source: string; email?: string }) => Promise<AuthAdmission>;
  close: () => Promise<void>;
}

export type AuthDestination =
  | { kind: "dashboard" }
  | { kind: "create-workspace" }
  | { kind: "workspaces" }
  | { kind: "workspace-projects"; workspaceId: string }
  | { kind: "project-page"; workspaceId: string; projectId: string; page: string };

export type ProtectedDestination = Exclude<
  AuthDestination,
  { kind: "dashboard" | "create-workspace" }
>;

export interface AuthUserRecord {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface AuthSessionRecord {
  id: string;
  userId: string;
  token: string;
  expiresAt: number;
  createdAt: number;
  updatedAt: number;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface AuthLinkRecord {
  digest: string;
  messageId: string;
  email: string;
  identity: { purpose: "setup"; name: string } | { purpose: "sign-in"; userId: string };
  issuedAt: number;
  expiresAt: number;
  status: "active" | "superseded" | "consumed";
  returnTo: ProtectedDestination | null;
}

export interface AuthEntryRecord {
  onboardingOffered: boolean;
  lastWorkspaceId: string | null;
}

/** Times are Unix milliseconds. Locking reads hold their locks through transaction completion. */
export interface AuthTransaction {
  lockSetup: () => Promise<"open" | "complete">;
  completeSetup: (userId: string) => Promise<void>;
  lockEmail: (email: string) => Promise<void>;
  link: (digest: string) => Promise<AuthLinkRecord | null>;
  replaceLink: (record: AuthLinkRecord) => Promise<void>;
  consumeLink: (digest: string) => Promise<boolean>;
  userById: (id: string) => Promise<AuthUserRecord | null>;
  userByEmail: (email: string) => Promise<AuthUserRecord | null>;
  insertUser: (user: AuthUserRecord) => Promise<AuthUserRecord>;
  insertSession: (session: AuthSessionRecord) => Promise<AuthSessionRecord>;
  session: (token: string) => Promise<AuthSessionRecord | null>;
  lockSession: (token: string) => Promise<AuthSessionRecord | null>;
  renewSession: (token: string, at: number, expiresAt: number) => Promise<AuthSessionRecord | null>;
  revokeSession: (token: string) => Promise<void>;
  authority: (userId: string) => Promise<"super_user" | null>;
  /** Locks the user's entry state until transaction completion. */
  entry: (userId: string) => Promise<AuthEntryRecord>;
  saveEntry: (userId: string, entry: AuthEntryRecord) => Promise<void>;
  authorize: (userId: string, destination: ProtectedDestination) => Promise<boolean>;
}

export interface AuthStore {
  /** All writes, including user/session creation and setup completion, commit or roll back together. */
  transaction: <Value>(
    operation: (transaction: AuthTransaction) => Promise<Value>,
  ) => Promise<Value>;
  /** Returns namespace-persistent signing material, initialized once without rotating on restart. */
  signingSecret: () => Promise<string>;
  /** Acquires the email lock before resolving an uncertain commit using its durable issuance marker. */
  resolveIssuance: (input: {
    messageId: string;
    email: string;
  }) => Promise<"committed" | "not-committed">;
  close: () => Promise<void>;
}

export class AuthStorageError extends Error {
  constructor(
    readonly kind: "unavailable" | "commit-unknown",
    options?: ErrorOptions,
  ) {
    super(kind, options);
  }
}

export type AuthEvent =
  | { kind: "request-blocked"; scopes: readonly AuthLimitScope[] }
  | {
      kind: "sign-in-failed";
      reason: "unknown-identity" | "invalid-link" | "superseded-link" | "setup-complete";
    }
  | { kind: "delivery-failed" }
  | { kind: "storage-unavailable" };
