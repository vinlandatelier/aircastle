import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import type { ContentStore, ProjectTransaction } from "@aircastle/core";
import { initializeLayout, qualified } from "./layout.ts";
import { projectTransaction } from "./project.ts";

export interface PostgresOptions {
  url: string;
  namespace?: string;
}

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

function validatedNamespace(value: string) {
  if (typeof value !== "string" || !value || value.includes("\0") || Buffer.byteLength(value) > 63)
    throw new Error("Invalid Postgres namespace");
  for (const point of value) {
    const code = point.charCodeAt(0);
    if (point.length === 1 && code >= 0xd800 && code <= 0xdfff)
      throw new Error("Invalid Postgres namespace Unicode");
  }
  return value;
}

async function databaseOperation<Value>(operation: () => Promise<Value>): Promise<Value> {
  try {
    return await operation();
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
    ) {
      const code = error.code;
      if (
        code.startsWith("08") ||
        [
          "53300",
          "57P01",
          "57P02",
          "57P03",
          "57014",
          "55P03",
          "40001",
          "40P01",
          "CONNECTION_CLOSED",
          "CONNECTION_ENDED",
          "CONNECT_TIMEOUT",
          "CONNECTION_DESTROYED",
          "ECONNRESET",
          "ECONNREFUSED",
          "ETIMEDOUT",
        ].includes(code)
      ) {
        throw Object.assign(new Error("Storage is temporarily unavailable"), {
          code: "unavailable",
        });
      }
    }
    throw error;
  }
}

export function postgresAdapter(options: PostgresOptions): ContentStore {
  const namespace = validatedNamespace(
    options.namespace === undefined ? "aircastle" : options.namespace,
  );
  if (typeof options.url !== "string" || options.url.length === 0)
    throw new Error("Postgres URL is required");
  const sql = postgres(options.url, { max: 10, onnotice: () => {} });
  const table = (name: string) => qualified(namespace, name);
  let closing: Promise<void> | undefined;
  return {
    initialize: () =>
      databaseOperation(() => sql.begin((transaction) => initializeLayout(transaction, namespace))),
    close: () => (closing ??= sql.end()),
    provision: (request) =>
      databaseOperation(() =>
        sql.begin(async (transaction) => {
          const workspaceName = request.workspaceName ?? "Development workspace";
          const projectName = request.projectName ?? "Development project";
          await transaction`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([namespace, "development"])}, 0))`;
          const workspaceKey = hash(workspaceName);
          await transaction.unsafe(
            `INSERT INTO ${table("workspaces")} (id, name) VALUES ($1, $2) ON CONFLICT (name_key) DO NOTHING`,
            [randomUUID(), workspaceName],
          );
          const workspaces = await transaction.unsafe<{ id: string; name: string }[]>(
            `SELECT id, name FROM ${table("workspaces")} WHERE name_key = $1`,
            [workspaceKey],
          );
          const workspace = workspaces[0];
          if (!workspace || workspace.name !== workspaceName)
            throw new Error("Workspace name hash collision");
          const projectKey = hash(projectName);
          await transaction.unsafe(
            `INSERT INTO ${table("projects")} (id, workspace_id, name) VALUES ($1, $2, $3) ON CONFLICT (workspace_id, name_key) DO NOTHING`,
            [randomUUID(), workspace.id, projectName],
          );
          const projects = await transaction.unsafe<{ id: string; name: string }[]>(
            `SELECT id, name FROM ${table("projects")} WHERE workspace_id = $1 AND name_key = $2 FOR UPDATE`,
            [workspace.id, projectKey],
          );
          const project = projects[0];
          if (!project || project.name !== projectName)
            throw new Error("Project name hash collision");
          const existing = await transaction.unsafe<{ verifier: string }[]>(
            `SELECT verifier FROM ${table("keys")} WHERE project_id = $1 LIMIT 1`,
            [project.id],
          );
          let issued = false;
          if (request.newKey || existing.length === 0) {
            await transaction.unsafe(
              `INSERT INTO ${table("keys")} (verifier, project_id, permissions) VALUES ($1, $2, $3::jsonb)`,
              [request.verifier, project.id, transaction.json([...request.permissions])],
            );
            issued = true;
          }
          return { workspace: workspace.id, project: project.id, issued };
        }),
      ),
    authorize: (project, verifier, permission) =>
      databaseOperation(async () => {
        const rows = await sql.unsafe<{ project_id: string; permissions: unknown }[]>(
          `SELECT project_id, permissions FROM ${table("keys")} WHERE verifier = $1`,
          [verifier],
        );
        const key = rows[0];
        if (!key) return "unauthorized";
        if (
          key.project_id !== project ||
          !Array.isArray(key.permissions) ||
          !key.permissions.includes(permission)
        )
          return "forbidden";
        return "authorized";
      }),
    transaction: <Value>(
      project: string,
      operation: (transaction: ProjectTransaction) => Promise<Value>,
    ) =>
      databaseOperation(async () => {
        const result = await sql.begin(async (transaction) => {
          const rows = await transaction.unsafe<{ id: string }[]>(
            `SELECT id FROM ${table("projects")} WHERE id = $1 FOR UPDATE`,
            [project],
          );
          if (!rows[0]) throw new Error("Unknown project");
          return { value: await operation(projectTransaction(transaction, namespace, project)) };
        });
        return result.value;
      }),
  };
}
