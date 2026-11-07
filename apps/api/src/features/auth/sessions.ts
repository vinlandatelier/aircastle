import { randomUUID } from "node:crypto";
import { type } from "arktype";
import { generateCookie, generateSignedCookie } from "hono/cookie";
import { parseSigned } from "hono/utils/cookie";
import type {
  AuthDestination,
  AuthEntryRecord,
  AuthSessionRecord,
  AuthStore,
  AuthTransaction,
  AuthUserRecord,
  ProtectedDestination,
} from "@aircastle/core";
import { authEntryInput } from "./request.ts";
import { digest, newToken } from "./token.ts";

const lifetime = 1_209_600_000;

export interface SessionPair {
  user: AuthUserRecord;
  session: AuthSessionRecord;
}

export function sessionProjection(pair: SessionPair) {
  const { user, session } = pair;
  return {
    user: { id: user.id, name: user.name, email: user.email, authority: "super_user" as const },
    expiresAt: session.expiresAt,
  };
}

/** Starts a session inside the caller's transaction. Only the token's digest is stored. */
export async function startSession(tx: AuthTransaction, user: AuthUserRecord, at: number) {
  const token = newToken();
  const session = await tx.insertSession({
    id: randomUUID(),
    userId: user.id,
    tokenDigest: digest(token),
    expiresAt: at + lifetime,
    createdAt: at,
    updatedAt: at,
  });
  return { token, pair: { user, session } };
}

/**
 * The signed, HttpOnly, host-only, SameSite=Lax session cookie. Its name carries the browser
 * origin's port, because cookies ignore ports and local instances share `localhost`.
 */
export function sessionCookie(browserOrigin: string, secret: string) {
  const origin = new URL(browserOrigin);
  const name = `aircastle_session_${origin.port || (origin.protocol === "https:" ? "443" : "80")}`;
  const attributes = { path: "/", httpOnly: true, sameSite: "Lax" } as const;
  return {
    read: async (request: Request): Promise<string | undefined> => {
      const header = request.headers.get("cookie");
      if (!header) return undefined;
      const token = (await parseSigned(header, secret, name))[name];
      return typeof token === "string" ? token : undefined;
    },
    issue: (token: string) =>
      generateSignedCookie(name, token, secret, { ...attributes, maxAge: lifetime / 1000 }),
    clear: () => generateCookie(name, "", { ...attributes, maxAge: 0 }),
  };
}

export function createSessions(storage: AuthStore, clock: () => number) {
  async function current(
    tx: AuthTransaction,
    token: string | undefined,
    access: "read" | "lock",
  ): Promise<SessionPair | null> {
    if (!token) return null;
    const session =
      access === "lock" ? await tx.lockSession(digest(token)) : await tx.session(digest(token));
    if (!session) return null;
    const user = await tx.userById(session.userId);
    if (!user || (await tx.authority(user.id)) !== "super_user" || session.expiresAt <= clock())
      return null;
    return { user, session };
  }

  async function renew(tx: AuthTransaction, pair: SessionPair): Promise<SessionPair | null> {
    const at = clock();
    const session = await tx.renewSession(pair.session.tokenDigest, at, at + lifetime);
    return session ? { user: pair.user, session } : null;
  }

  async function destination(
    tx: AuthTransaction,
    userId: string,
    input: typeof authEntryInput.infer,
  ): Promise<
    { kind: "ok"; destination: AuthDestination; entry: AuthEntryRecord } | { kind: "forbidden" }
  > {
    const entry = await tx.entry(userId);
    const target =
      input.kind === "visit"
        ? input.destination
        : input.kind === "resolve"
          ? input.requested
          : undefined;
    if (target && (await tx.authorize(userId, target))) {
      return {
        kind: "ok",
        destination: target,
        entry: {
          onboardingOffered: true,
          lastWorkspaceId:
            target.kind === "workspaces" ? entry.lastWorkspaceId : target.workspaceId,
        },
      };
    }
    if (input.kind === "visit") return { kind: "forbidden" };
    if (input.kind === "skip-onboarding") {
      return {
        kind: "ok",
        destination: { kind: "workspaces" },
        entry: { ...entry, onboardingOffered: true },
      };
    }
    if (entry.lastWorkspaceId) {
      const remembered: ProtectedDestination = {
        kind: "workspace-projects",
        workspaceId: entry.lastWorkspaceId,
      };
      const allowed = await tx.authorize(userId, remembered);
      return {
        kind: "ok",
        destination: allowed ? remembered : { kind: "workspaces" },
        entry: { onboardingOffered: true, lastWorkspaceId: allowed ? entry.lastWorkspaceId : null },
      };
    }
    return {
      kind: "ok",
      destination: { kind: entry.onboardingOffered ? "workspaces" : "create-workspace" },
      entry: { ...entry, onboardingOffered: true },
    };
  }

  return {
    /** The instance state for `/auth/state`, read without locks or renewal. */
    state: (token: string | undefined) =>
      storage.transaction(async (tx) => {
        const pair = await current(tx, token, "read");
        if (pair) return { kind: "authenticated" as const, session: sessionProjection(pair) };
        return {
          kind:
            (await tx.setupState()) === "open"
              ? ("setup-required" as const)
              : ("signed-out" as const),
        };
      }),
    read: (token: string | undefined) => storage.transaction((tx) => current(tx, token, "read")),
    activity: (token: string | undefined) =>
      storage.transaction(async (tx) => {
        const pair = await current(tx, token, "lock");
        return pair ? renew(tx, pair) : null;
      }),
    entry: (token: string | undefined, body: unknown) =>
      storage.transaction(async (tx) => {
        const pair = await current(tx, token, "lock");
        if (!pair) return { kind: "unauthenticated" as const };
        const input = authEntryInput(body);
        if (input instanceof type.errors) return { kind: "invalid-input" as const };
        const result = await destination(tx, pair.user.id, input);
        if (result.kind === "forbidden") return result;
        const renewed = await renew(tx, pair);
        if (!renewed) return { kind: "unauthenticated" as const };
        await tx.saveEntry(pair.user.id, result.entry);
        return { kind: "ok" as const, destination: result.destination, pair: renewed };
      }),
    signOut: async (token: string | undefined) => {
      if (!token) return;
      await storage.transaction(async (tx) => {
        await tx.lockSession(digest(token));
        await tx.revokeSession(digest(token));
      });
    },
  };
}
