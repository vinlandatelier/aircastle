import type { AuthAdmissionStore, AuthEvent, AuthLimits, AuthStore } from "@aircastle/core";
import type { Logger } from "pino";
import { developmentAuth, boundedEvents } from "./runtime.ts";
import { authResponse, ok } from "./request.ts";
import type { DevelopmentInbox } from "../development-inbox/index.ts";

export type LocalAuthConfig =
  | { mode: "disabled" }
  | {
      mode: "development";
      browserOrigin: string;
      initialEmail?: string;
      limits: AuthLimits;
    };

export interface LocalAuthRuntime {
  handle: (request: Request, peer: { address: string | undefined }) => Promise<Response>;
  close: () => Promise<void>;
}

export type LocalAuthOptions =
  | { config: { mode: "disabled" } }
  | {
      config: Extract<LocalAuthConfig, { mode: "development" }>;
      storage: AuthStore;
      admission: AuthAdmissionStore;
      clock?: () => number;
      inbox?: DevelopmentInbox;
      emit: (event: AuthEvent) => void;
    };

export async function createLocalAuth(options: LocalAuthOptions): Promise<LocalAuthRuntime> {
  if (!("storage" in options))
    return {
      handle: async (request) => {
        const url = new URL(request.url);
        return request.method === "GET" && url.pathname === "/api/auth/state"
          ? authResponse(ok({ kind: "disabled" }))
          : authResponse({ kind: "not-found" }, 404);
      },
      close: async () => {},
    };
  return developmentAuth(options);
}

/** Writes bounded, structured auth diagnostics through the application logger. */
export function createAuthEventLogger(logger: Logger): (event: AuthEvent) => void {
  return boundedEvents((event) => logger.info({ auth: event }, "Authentication event"), Date.now);
}
