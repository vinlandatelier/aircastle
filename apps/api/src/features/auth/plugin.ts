import type { GenericEndpointContext } from "@better-auth/core";
import { createAuthEndpoint } from "better-auth/api";

export function pluginResponse(
  context: GenericEndpointContext,
  value: Record<string, unknown>,
  status: Parameters<GenericEndpointContext["setStatus"]>[0] = 200,
) {
  context.setStatus(status);
  return context.json(value);
}

export interface LocalAuthOperations {
  confirm: (context: GenericEndpointContext) => Promise<unknown>;
  session: (context: GenericEndpointContext) => Promise<unknown>;
  signOut: (context: GenericEndpointContext) => Promise<unknown>;
}

export function localAuthPlugin(operations: LocalAuthOperations) {
  return {
    id: "aircastle-local-auth",
    endpoints: {
      aircastleConfirm: createAuthEndpoint("/aircastle/confirm", { method: "POST" }, (context) =>
        operations.confirm(context),
      ),
      aircastleSession: createAuthEndpoint("/aircastle/session", { method: "GET" }, (context) =>
        operations.session(context),
      ),
      aircastleSignOut: createAuthEndpoint("/aircastle/sign-out", { method: "POST" }, (context) =>
        operations.signOut(context),
      ),
    },
  };
}
