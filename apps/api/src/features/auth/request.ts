import { type } from "arktype";
import { authSetupInput, authSignInInput } from "@aircastle/contracts";
import type { ProtectedDestination } from "@aircastle/core";
import type { AccountInput, LinkInput } from "./credentials.ts";

const workspaceId = type("string.uuid");
const destination = type
  .or(
    { kind: "'workspaces'" },
    { kind: "'workspace-projects'", workspaceId },
    {
      kind: "'project-page'",
      workspaceId,
      projectId: workspaceId,
      page: "'tasks' | 'collections' | 'media' | 'analytics' | 'users' | 'access-tokens' | 'settings'",
    },
  )
  .onDeepUndeclaredKey("reject");

export const authEntryInput = type
  .or(
    { kind: "'resolve'", "requested?": destination },
    { kind: "'skip-onboarding'" },
    { kind: "'visit'", destination },
  )
  .onDeepUndeclaredKey("reject");

export function parseAccount(
  body: unknown,
  purpose: "setup" | "sign-in",
):
  | { kind: "valid"; value: AccountInput }
  | { kind: "invalid-input"; fields: Record<string, string> } {
  if (!body || typeof body !== "object" || Array.isArray(body))
    return { kind: "invalid-input", fields: { email: "Enter a valid email" } };
  const { returnTo, ...account } = body as Record<string, unknown>;
  const parsed = purpose === "setup" ? authSetupInput(account) : authSignInInput(account);
  if (parsed instanceof type.errors) {
    const fields: Record<string, string> = {};
    for (const error of parsed) fields[String(error.path[0] ?? "email")] = error.message;
    return { kind: "invalid-input", fields };
  }
  let target: ProtectedDestination | null = null;
  if (returnTo !== undefined) {
    const parsedTarget = destination(returnTo);
    if (parsedTarget instanceof type.errors)
      return { kind: "invalid-input", fields: { returnTo: "Choose an allowed destination" } };
    target = parsedTarget;
  }
  if (purpose === "setup" && "name" in parsed && typeof parsed.name === "string")
    return {
      kind: "valid",
      value: { purpose, name: parsed.name, email: parsed.email, returnTo: target },
    };
  if (purpose === "sign-in")
    return { kind: "valid", value: { purpose, email: parsed.email, returnTo: target } };
  return { kind: "invalid-input", fields: { name: "Enter your name" } };
}

export function parseLink(body: unknown): LinkInput {
  if (
    body &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    "purpose" in body &&
    (body.purpose === "setup" || body.purpose === "sign-in") &&
    "token" in body &&
    typeof body.token === "string" &&
    Object.keys(body).every((key) => key === "purpose" || key === "token")
  )
    return { purpose: body.purpose, token: body.token };
  return { purpose: "sign-in", token: "" };
}

export async function jsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export function authResponse(value: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export const ok = (value: unknown) => ({ kind: "ok" as const, value });
