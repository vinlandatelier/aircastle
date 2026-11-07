import { AuthStorageError } from "@aircastle/core";
import type { AuthEvent } from "@aircastle/core";
import { createDevelopmentInbox } from "../development-inbox/index.ts";
import { createCredentials, storageUnavailable } from "./credentials.ts";
import { createSessions, sessionCookie, sessionProjection } from "./sessions.ts";
import { authResponse, jsonBody, ok, parseAccount, parseLink } from "./request.ts";
import type { LocalAuthOptions, LocalAuthRuntime } from "./index.ts";

export function boundedEvents(emit: (event: AuthEvent) => void, clock: () => number) {
  const seen = new Map<string, number>();
  let window = clock();
  return (event: AuthEvent) => {
    const now = clock();
    if (now - window >= 60_000 || now < window) {
      seen.clear();
      window = now;
    }
    const key = JSON.stringify(event);
    const count = seen.get(key) ?? 0;
    if (count >= 5) return;
    seen.set(key, count + 1);
    emit(event);
  };
}

const openMessageRoute = "/api/development-inbox/messages/:id/open";

/** Every method and path the development runtime answers. Anything else is 404 before the Host and Origin checks. */
export const dispatched = [
  { method: "GET", path: "/api/auth/state" },
  { method: "GET", path: "/api/auth/session" },
  { method: "GET", path: "/api/development-inbox/messages" },
  { method: "POST", path: "/api/auth/setup" },
  { method: "POST", path: "/api/auth/sign-in" },
  { method: "POST", path: "/api/auth/confirm" },
  { method: "POST", path: "/api/auth/confirm/preview" },
  { method: "POST", path: "/api/auth/sign-out" },
  { method: "POST", path: "/api/auth/activity" },
  { method: "POST", path: "/api/auth/entry" },
  { method: "POST", path: openMessageRoute },
] as const;

export async function developmentAuth(
  options: Extract<LocalAuthOptions, { storage: unknown }>,
): Promise<LocalAuthRuntime> {
  const { storage, admission, config } = options;
  const clock = options.clock ?? Date.now;
  const emit = boundedEvents((event) => options.emit(event), clock);
  const inbox = options.inbox ?? createDevelopmentInbox();
  const credentials = createCredentials({
    storage,
    inbox,
    clock,
    emit,
    report: options.report,
    origin: config.browserOrigin,
    ...(config.initialEmail === undefined ? {} : { initialEmail: config.initialEmail }),
  });
  const sessions = createSessions(storage, clock);
  const cookie = sessionCookie(config.browserOrigin, await storage.signingSecret());
  const origin = new URL(config.browserOrigin);
  const unauthenticated = () => authResponse({ kind: "unauthenticated" }, 401);

  async function respond(
    request: Request,
    path: string,
    peer: { address: string | undefined },
    openMessage: string | undefined,
  ): Promise<Response> {
    if (path === "/api/development-inbox/messages") return authResponse(ok(inbox.list()));
    if (openMessage !== undefined) {
      let messageId: string;
      try {
        messageId = decodeURIComponent(openMessage);
      } catch (error) {
        if (!(error instanceof URIError)) throw error;
        return authResponse({ kind: "not-found" }, 404);
      }
      const entry = inbox.open(messageId);
      return entry ? authResponse(ok(entry)) : authResponse({ kind: "not-found" }, 404);
    }
    const token = await cookie.read(request);
    if (path === "/api/auth/state") return authResponse(ok(await sessions.state(token)));
    if (path === "/api/auth/session") {
      const pair = await sessions.read(token);
      return pair ? authResponse(ok(sessionProjection(pair))) : unauthenticated();
    }
    if (path === "/api/auth/sign-out") {
      await sessions.signOut(token);
      return authResponse(ok({ destination: "/sign-in" }), 200, { "Set-Cookie": cookie.clear() });
    }
    if (path === "/api/auth/activity") {
      const pair = await sessions.activity(token);
      if (!pair || !token) return unauthenticated();
      return authResponse(ok(sessionProjection(pair)), 200, {
        "Set-Cookie": await cookie.issue(token),
      });
    }
    const body = await jsonBody(request);
    if (path === "/api/auth/entry") {
      const result = await sessions.entry(token, body);
      if (result.kind !== "ok" || !token)
        return authResponse(
          result.kind === "ok" ? { kind: "unauthenticated" } : result,
          result.kind === "forbidden" ? 403 : result.kind === "invalid-input" ? 400 : 401,
        );
      return authResponse(
        ok({ destination: result.destination, session: sessionProjection(result.pair) }),
        200,
        { "Set-Cookie": await cookie.issue(token) },
      );
    }
    if (path === "/api/auth/confirm") {
      const result = await credentials.confirm(parseLink(body));
      if (result.kind === "failure")
        return authResponse(result.failure, result.failure.kind === "setup-complete" ? 409 : 400);
      return authResponse(ok({ destination: result.destination }), 200, {
        "Set-Cookie": await cookie.issue(result.token),
      });
    }
    if (path === "/api/auth/confirm/preview") {
      const result = await credentials.preview(parseLink(body));
      if (result.kind === "failure")
        return authResponse(result.failure, result.failure.kind === "setup-complete" ? 409 : 400);
      return authResponse(ok({ email: result.email, purpose: result.purpose }));
    }
    if (!peer.address) return authResponse({ kind: "forbidden" }, 403);
    const purpose = path === "/api/auth/setup" ? "setup" : "sign-in";
    const parsed = parseAccount(body, purpose);
    const admitted = await admission.admit({
      source: peer.address,
      ...(parsed.kind === "valid" ? { email: parsed.value.email } : {}),
    });
    if (admitted.kind === "throttled") {
      emit({ kind: "request-blocked", scopes: admitted.scopes });
      return authResponse({ kind: "throttled", retryAt: admitted.retryAt }, 429, {
        "Retry-After": String(Math.max(0, Math.ceil((admitted.retryAt - clock()) / 1000))),
      });
    }
    if (parsed.kind === "invalid-input") return authResponse(parsed, 400);
    const result = await credentials.issue(parsed.value);
    if (result.kind === "issued")
      return authResponse(
        ok({ confirmation: purpose === "setup" ? "setup-inbox" : "sign-in-inbox" }),
      );
    return authResponse(
      result,
      result.kind === "temporary-failure" ? 503 : result.kind === "email-not-allowed" ? 403 : 409,
    );
  }

  return {
    handle: async (request, peer) => {
      const url = new URL(request.url);
      const path = url.pathname;
      const method = request.method;
      const openMessage =
        method === "POST"
          ? /^\/api\/development-inbox\/messages\/([^/]+)\/open$/.exec(path)?.[1]
          : undefined;
      const route = openMessage === undefined ? path : openMessageRoute;
      if (!dispatched.some((entry) => entry.method === method && entry.path === route))
        return authResponse({ kind: "not-found" }, 404);
      if (
        (request.headers.get("host") ?? url.host) !== origin.host ||
        (request.headers.has("origin") && request.headers.get("origin") !== origin.origin) ||
        (method === "POST" && request.headers.get("origin") !== origin.origin)
      )
        return authResponse({ kind: "forbidden" }, 403);
      try {
        return await respond(request, path, peer, openMessage);
      } catch (error) {
        if (!(error instanceof AuthStorageError)) throw error;
        emit(storageUnavailable(error));
        return authResponse({ kind: "temporary-failure" }, 503);
      }
    },
    close: () => credentials.close(),
  };
}
