import { type } from "arktype";
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

interface SessionPair {
  user: AuthUserRecord;
  session: AuthSessionRecord;
}

type SessionToken = string | false | null;

export function sessionProjection(pair: SessionPair) {
  const { user, session } = pair;
  return {
    user: { id: user.id, name: user.name, email: user.email, authority: "super_user" as const },
    expiresAt: session.expiresAt,
  };
}

export function createSessions(storage: AuthStore, clock: () => number) {
  async function current(tx: AuthTransaction, token: SessionToken): Promise<SessionPair | null> {
    if (!token) return null;
    const session = await tx.lockSession(token);
    if (!session) return null;
    const user = await tx.userById(session.userId);
    if (!user || (await tx.authority(user.id)) !== "super_user" || session.expiresAt <= clock())
      return null;
    return { user, session };
  }

  async function renew(tx: AuthTransaction, pair: SessionPair): Promise<SessionPair | null> {
    const at = clock();
    const session = await tx.renewSession(pair.session.token, at, at + 1_209_600_000);
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
    read: (token: SessionToken) => storage.transaction((tx) => current(tx, token)),
    activity: (token: SessionToken) =>
      storage.transaction(async (tx) => {
        const pair = await current(tx, token);
        return pair ? renew(tx, pair) : null;
      }),
    entry: (token: SessionToken, body: unknown) =>
      storage.transaction(async (tx) => {
        const pair = await current(tx, token);
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
  };
}
