import { AuthStorageError } from "@aircastle/core";
import type {
  AuthEntryRecord,
  AuthLinkRecord,
  AuthSessionRecord,
  AuthTransaction,
  AuthUserRecord,
} from "@aircastle/core";
import type postgres from "postgres";
import { identifier } from "../identifier.ts";

type UserRow = Omit<AuthUserRecord, "createdAt" | "updatedAt"> & {
  createdAt: Date;
  updatedAt: Date;
};
type SessionRow = Omit<AuthSessionRecord, "expiresAt" | "createdAt" | "updatedAt"> & {
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};
type LinkRow = Omit<AuthLinkRecord, "issuedAt" | "expiresAt"> & {
  issuedAt: Date;
  expiresAt: Date;
};

function userRecord(row: UserRow | undefined): AuthUserRecord | null {
  return row
    ? { ...row, createdAt: row.createdAt.getTime(), updatedAt: row.updatedAt.getTime() }
    : null;
}

function sessionRecord(row: SessionRow | undefined): AuthSessionRecord | null {
  return row
    ? {
        ...row,
        expiresAt: row.expiresAt.getTime(),
        createdAt: row.createdAt.getTime(),
        updatedAt: row.updatedAt.getTime(),
      }
    : null;
}

export function authTransaction(sql: postgres.TransactionSql, namespace: string): AuthTransaction {
  const table = (name: string) => identifier(sql, namespace, name);
  const userColumns = () =>
    sql`id, name, email, email_verified AS "emailVerified", image, created_at AS "createdAt", updated_at AS "updatedAt"`;
  const sessionColumns = () =>
    sql`id, user_id AS "userId", token, expires_at AS "expiresAt", created_at AS "createdAt", updated_at AS "updatedAt", ip_address AS "ipAddress", user_agent AS "userAgent"`;
  const linkColumns = () =>
    sql`digest, message_id AS "messageId", email, identity, issued_at AS "issuedAt", expires_at AS "expiresAt", status, return_to AS "returnTo"`;
  const lockEmail = async (email: string) => {
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([namespace, "auth-email", email])}, 0))`;
  };
  return {
    lockSetup: async () => {
      const [row] = await sql<
        { setup_user_id: string | null }[]
      >`SELECT setup_user_id FROM ${table("auth_settings")} WHERE singleton = 1 FOR UPDATE`;
      if (!row) throw new AuthStorageError("unavailable");
      return row.setup_user_id === null ? "open" : "complete";
    },
    completeSetup: async (userId) => {
      const rows =
        await sql`UPDATE ${table("auth_settings")} SET setup_user_id = ${userId} WHERE singleton = 1 AND setup_user_id IS NULL AND EXISTS (SELECT FROM ${table("auth_users")} WHERE id = ${userId}) RETURNING singleton`;
      if (rows.length !== 1) throw new AuthStorageError("unavailable");
    },
    lockEmail,
    link: async (digest) => {
      const [row] = await sql<
        LinkRow[]
      >`SELECT ${linkColumns()} FROM ${table("auth_links")} WHERE digest = ${digest}`;
      return row
        ? { ...row, issuedAt: row.issuedAt.getTime(), expiresAt: row.expiresAt.getTime() }
        : null;
    },
    replaceLink: async (record) => {
      await lockEmail(record.email);
      await sql`UPDATE ${table("auth_links")} SET status = 'superseded' WHERE email = ${record.email} AND status = 'active'`;
      await sql`INSERT INTO ${table("auth_links")} (digest, message_id, email, identity, issued_at, expires_at, status, return_to) VALUES (${record.digest}, ${record.messageId}, ${record.email}, ${sql.json(record.identity)}::jsonb, ${new Date(record.issuedAt)}, ${new Date(record.expiresAt)}, ${record.status}, ${record.returnTo === null ? null : sql.json(record.returnTo)}::jsonb)`;
      await sql`INSERT INTO ${table("auth_issuances")} (message_id, email) VALUES (${record.messageId}, ${record.email})`;
    },
    consumeLink: async (digest) => {
      const [row] = await sql<
        { email: string }[]
      >`SELECT email FROM ${table("auth_links")} WHERE digest = ${digest}`;
      if (!row) return false;
      await lockEmail(row.email);
      const rows =
        await sql`UPDATE ${table("auth_links")} SET status = 'consumed' WHERE digest = ${digest} AND status = 'active' RETURNING digest`;
      return rows.length === 1;
    },
    userById: async (id) => {
      const [row] = await sql<
        UserRow[]
      >`SELECT ${userColumns()} FROM ${table("auth_users")} WHERE id = ${id}`;
      return userRecord(row);
    },
    userByEmail: async (email) => {
      const [row] = await sql<
        UserRow[]
      >`SELECT ${userColumns()} FROM ${table("auth_users")} WHERE email = ${email}`;
      return userRecord(row);
    },
    insertUser: async (user) => {
      const [row] = await sql<
        UserRow[]
      >`INSERT INTO ${table("auth_users")} (id, name, email, email_verified, image, created_at, updated_at) VALUES (${user.id}, ${user.name}, ${user.email}, ${user.emailVerified}, ${user.image}, ${new Date(user.createdAt)}, ${new Date(user.updatedAt)}) RETURNING ${userColumns()}`;
      const inserted = userRecord(row);
      if (!inserted) throw new AuthStorageError("unavailable");
      return inserted;
    },
    insertSession: async (session) => {
      const [row] = await sql<
        SessionRow[]
      >`INSERT INTO ${table("auth_sessions")} (id, user_id, token, expires_at, created_at, updated_at, ip_address, user_agent) VALUES (${session.id}, ${session.userId}, ${session.token}, ${new Date(session.expiresAt)}, ${new Date(session.createdAt)}, ${new Date(session.updatedAt)}, ${session.ipAddress}, ${session.userAgent}) RETURNING ${sessionColumns()}`;
      const inserted = sessionRecord(row);
      if (!inserted) throw new AuthStorageError("unavailable");
      return inserted;
    },
    session: async (token) => {
      const [row] = await sql<
        SessionRow[]
      >`SELECT ${sessionColumns()} FROM ${table("auth_sessions")} WHERE token = ${token}`;
      return sessionRecord(row);
    },
    lockSession: async (token) => {
      const [row] = await sql<
        SessionRow[]
      >`SELECT ${sessionColumns()} FROM ${table("auth_sessions")} WHERE token = ${token} FOR UPDATE`;
      return sessionRecord(row);
    },
    renewSession: async (token, at, expiresAt) => {
      const [row] = await sql<
        SessionRow[]
      >`UPDATE ${table("auth_sessions")} SET updated_at = ${new Date(at)}, expires_at = ${new Date(expiresAt)} WHERE token = ${token} AND expires_at > ${new Date(at)} RETURNING ${sessionColumns()}`;
      return sessionRecord(row);
    },
    revokeSession: async (token) => {
      await sql`DELETE FROM ${table("auth_sessions")} WHERE token = ${token}`;
    },
    authority: async (userId) => {
      const [row] = await sql<
        { exists: boolean }[]
      >`SELECT EXISTS (SELECT FROM ${table("auth_settings")} AS settings JOIN ${table("auth_users")} AS users ON users.id = settings.setup_user_id WHERE settings.singleton = 1 AND users.id = ${userId}) AS exists`;
      return row?.exists ? "super_user" : null;
    },
    entry: async (userId) => {
      const [row] = await sql<
        AuthEntryRecord[]
      >`SELECT onboarding_offered AS "onboardingOffered", last_workspace_id AS "lastWorkspaceId" FROM ${table("auth_users")} WHERE id = ${userId} FOR UPDATE`;
      if (!row) throw new AuthStorageError("unavailable");
      return row;
    },
    saveEntry: async (userId, entry) => {
      const rows =
        await sql`UPDATE ${table("auth_users")} SET onboarding_offered = ${entry.onboardingOffered}, last_workspace_id = ${entry.lastWorkspaceId} WHERE id = ${userId} RETURNING id`;
      if (rows.length !== 1) throw new AuthStorageError("unavailable");
    },
    authorize: async (userId, destination) => {
      if (destination.kind === "workspaces") {
        const [row] = await sql<
          { exists: boolean }[]
        >`SELECT EXISTS (SELECT FROM ${table("auth_users")} WHERE id = ${userId}) AS exists`;
        return row?.exists ?? false;
      }
      const [access] = await sql<
        { exists: boolean }[]
      >`SELECT EXISTS (SELECT FROM ${table("auth_workspace_access")} WHERE user_id = ${userId} AND workspace_id::text = ${destination.workspaceId}) AS exists`;
      if (!access?.exists) return false;
      if (destination.kind === "workspace-projects") return true;
      const [project] = await sql<
        { exists: boolean }[]
      >`SELECT EXISTS (SELECT FROM ${table("projects")} WHERE id::text = ${destination.projectId} AND workspace_id::text = ${destination.workspaceId}) AS exists`;
      return project?.exists ?? false;
    },
  };
}
