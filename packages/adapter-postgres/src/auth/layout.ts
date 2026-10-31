import { randomBytes } from "node:crypto";
import type postgres from "postgres";
import { identifier } from "../identifier.ts";
import { initializeLayout } from "../layout.ts";

export async function initializeAuthLayout(sql: postgres.TransactionSql, namespace: string) {
  await initializeLayout(sql, namespace);
  const table = (name: string) => identifier(sql, namespace, name);
  const [existing] = await sql<{ exists: boolean }[]>`
    SELECT to_regclass(format('%I.%I', ${namespace}::text, 'auth_migrations')) IS NOT NULL AS exists`;
  if (existing?.exists) {
    const versions = await sql<
      { version: number }[]
    >`SELECT version FROM ${table("auth_migrations")} ORDER BY version`;
    if (
      versions[0]?.version !== 1 ||
      versions.length > 2 ||
      (versions.length === 2 && versions[1]?.version !== 2)
    )
      throw new Error("Unsupported Aircastle auth migration version");
    if (versions.length === 1) await migrateAdmission(sql, namespace);
    return;
  }
  await sql`CREATE TABLE ${table("auth_migrations")} (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE TABLE ${table("auth_settings")} (singleton integer PRIMARY KEY CHECK (singleton = 1), signing_secret text NOT NULL, setup_user_id text UNIQUE)`;
  await sql`CREATE TABLE ${table("auth_users")} (id text PRIMARY KEY, name text NOT NULL, email text COLLATE "C" NOT NULL UNIQUE, email_verified boolean NOT NULL, image text, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, onboarding_offered boolean NOT NULL DEFAULT false, last_workspace_id text)`;
  await sql`CREATE TABLE ${table("auth_sessions")} (id text PRIMARY KEY, user_id text NOT NULL REFERENCES ${table("auth_users")}(id) ON DELETE CASCADE, token text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, ip_address text, user_agent text)`;
  await sql`CREATE INDEX ON ${table("auth_sessions")} (user_id)`;
  await sql`CREATE TABLE ${table("auth_links")} (digest text PRIMARY KEY, message_id text NOT NULL UNIQUE, email text COLLATE "C" NOT NULL, identity jsonb NOT NULL, issued_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, status text NOT NULL CHECK (status IN ('active', 'superseded', 'consumed')), return_to jsonb)`;
  await sql`CREATE UNIQUE INDEX ON ${table("auth_links")} (email) WHERE status = 'active'`;
  await sql`CREATE TABLE ${table("auth_issuances")} (message_id text PRIMARY KEY, email text COLLATE "C" NOT NULL)`;
  await sql`CREATE TABLE ${table("auth_workspace_access")} (user_id text NOT NULL REFERENCES ${table("auth_users")}(id) ON DELETE CASCADE, workspace_id uuid NOT NULL REFERENCES ${table("workspaces")}(id) ON DELETE CASCADE, PRIMARY KEY (user_id, workspace_id))`;
  await sql`INSERT INTO ${table("auth_settings")} (singleton, signing_secret) VALUES (1, ${randomBytes(48).toString("base64url")})`;
  await sql`INSERT INTO ${table("auth_migrations")} (version) VALUES (1)`;
  await migrateAdmission(sql, namespace);
}

async function migrateAdmission(sql: postgres.TransactionSql, namespace: string) {
  const table = (name: string) => identifier(sql, namespace, name);
  await sql`CREATE TABLE ${table("auth_admission_policy")} (singleton integer PRIMARY KEY CHECK (singleton = 1), policy text NOT NULL)`;
  await sql`CREATE TABLE ${table("auth_admission_events")} (scope text NOT NULL CHECK (scope IN ('email', 'ip', 'global')), identity text COLLATE "C" NOT NULL, admitted_at bigint NOT NULL)`;
  await sql`CREATE INDEX ON ${table("auth_admission_events")} (scope, identity, admitted_at)`;
  await sql`INSERT INTO ${table("auth_migrations")} (version) VALUES (2)`;
}
