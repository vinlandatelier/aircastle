import type { AuthEvent } from "@aircastle/core";
import { getCurrentAdapter, runWithTransaction } from "@better-auth/core/context";
import { deleteSessionCookie, setSessionCookie } from "better-auth/cookies";
import type { GenericEndpointContext } from "@better-auth/core";
import { createDevelopmentInbox } from "../development-inbox/index.ts";
import { createLibraryAdapter, libraryUserRecord, librarySessionRecord } from "./adapter.ts";
import { createCredentials } from "./credentials.ts";
import type { LinkInput } from "./credentials.ts";
import { createSessions, sessionProjection } from "./sessions.ts";
import { localAuthPlugin, pluginResponse } from "./plugin.ts";
import { localAuthLibrary } from "./library.ts";
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

type AuthMutation =
  | { kind: "link"; input: LinkInput }
  | { kind: "activity" }
  | { kind: "entry"; input: unknown };

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
    origin: config.browserOrigin,
    ...(config.initialEmail === undefined ? {} : { initialEmail: config.initialEmail }),
  });
  const sessions = createSessions(storage, clock);
  const bridge = createLibraryAdapter(storage);
  const secret = await storage.signingSecret();
  const signedToken = (ctx: GenericEndpointContext) =>
    ctx.getSignedCookie(ctx.context.authCookies.sessionToken.name, ctx.context.secret);
  const library = localAuthLibrary({
    origin: config.browserOrigin,
    secret,
    database: bridge.database,
    plugin: localAuthPlugin({
      confirm: async (ctx) => {
        try {
          const mutation: AuthMutation = ctx.body;
          if (mutation.kind === "activity") {
            const pair = await sessions.activity(await signedToken(ctx));
            if (!pair) return pluginResponse(ctx, { kind: "unauthenticated" }, 401);
            await setSessionCookie(
              ctx,
              {
                user: libraryUserRecord(pair.user),
                session: librarySessionRecord(pair.session),
              },
              false,
            );
            return pluginResponse(ctx, ok(sessionProjection(pair)));
          }
          if (mutation.kind === "entry") {
            const result = await sessions.entry(await signedToken(ctx), mutation.input);
            if (result.kind !== "ok")
              return pluginResponse(
                ctx,
                result,
                result.kind === "unauthenticated" ? 401 : result.kind === "forbidden" ? 403 : 400,
              );
            await setSessionCookie(
              ctx,
              {
                user: libraryUserRecord(result.pair.user),
                session: librarySessionRecord(result.pair.session),
              },
              false,
            );
            return pluginResponse(ctx, ok({ destination: result.destination }));
          }
          const input = mutation.input;
          const result = await runWithTransaction(ctx.context.adapter, async () => {
            const tx = bridge.transaction(await getCurrentAdapter(ctx.context.adapter));
            return credentials.confirm(
              tx,
              input,
              async (name, email, at) => {
                const user = await ctx.context.internalAdapter.createUser(
                  {
                    name,
                    email,
                    emailVerified: true,
                    createdAt: new Date(at),
                    updatedAt: new Date(at),
                  },
                  { method: "aircastle-setup" },
                );
                return {
                  ...user,
                  image: user.image ?? null,
                  createdAt: user.createdAt.getTime(),
                  updatedAt: user.updatedAt.getTime(),
                };
              },
              async (user, at) => ({
                user: libraryUserRecord(user),
                session: await ctx.context.internalAdapter.createSession(
                  user.id,
                  false,
                  {
                    createdAt: new Date(at),
                    updatedAt: new Date(at),
                    expiresAt: new Date(at + 1_209_600_000),
                    ipAddress: null,
                    userAgent: null,
                  },
                  true,
                ),
              }),
            );
          });
          if (result.kind === "failure")
            return pluginResponse(
              ctx,
              result.failure,
              result.failure.kind === "setup-complete" ? 409 : 400,
            );
          await setSessionCookie(ctx, result.pair, false);
          return pluginResponse(ctx, ok({ destination: result.destination }));
        } catch {
          emit({ kind: "storage-unavailable" });
          return pluginResponse(ctx, { kind: "temporary-failure" }, 503);
        }
      },
      session: async (ctx) => {
        try {
          const token = await signedToken(ctx);
          const pair = await sessions.read(token);
          return pair
            ? pluginResponse(ctx, ok(sessionProjection(pair)))
            : pluginResponse(ctx, { kind: "unauthenticated" }, 401);
        } catch {
          emit({ kind: "storage-unavailable" });
          return pluginResponse(ctx, { kind: "temporary-failure" }, 503);
        }
      },
      signOut: async (ctx) => {
        try {
          const token = await signedToken(ctx);
          if (token)
            await storage.transaction(async (tx) => {
              await tx.lockSession(token);
              await tx.revokeSession(token);
            });
          deleteSessionCookie(ctx);
          return pluginResponse(ctx, ok({ destination: "/sign-in" }));
        } catch {
          emit({ kind: "storage-unavailable" });
          return pluginResponse(ctx, { kind: "temporary-failure" }, 503);
        }
      },
    }),
  });
  async function callLibrary(
    request: Request,
    path: "session" | "confirm" | "sign-out",
    body?: AuthMutation,
  ) {
    const headers = new Headers(request.headers);
    headers.delete("content-length");
    const response = await library.handler(
      new Request(`${config.browserOrigin}/api/auth/aircastle/${path}`, {
        method: path === "session" ? "GET" : "POST",
        headers,
        ...(path === "session" ? {} : { body: JSON.stringify(body ?? {}) }),
      }),
    );
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  }
  return {
    handle: async (request, peer) => {
      const url = new URL(request.url);
      const path = url.pathname;
      const method = request.method;
      const openMessage = /^\/api\/development-inbox\/messages\/([^/]+)\/open$/.exec(path);
      const known =
        (method === "GET" &&
          ["/api/auth/state", "/api/auth/session", "/api/development-inbox/messages"].includes(
            path,
          )) ||
        (method === "POST" &&
          ([
            "/api/auth/setup",
            "/api/auth/sign-in",
            "/api/auth/confirm",
            "/api/auth/confirm/preview",
            "/api/auth/sign-out",
            "/api/auth/activity",
            "/api/auth/entry",
          ].includes(path) ||
            openMessage));
      if (!known) return authResponse({ kind: "not-found" }, 404);
      const origin = new URL(config.browserOrigin);
      if (
        (request.headers.get("host") ?? url.host) !== origin.host ||
        (request.headers.has("origin") && request.headers.get("origin") !== origin.origin) ||
        (method === "POST" && request.headers.get("origin") !== origin.origin)
      )
        return authResponse({ kind: "forbidden" }, 403);
      try {
        if (path === "/api/auth/state") {
          const session = await callLibrary(request, "session");
          if (session.status === 200)
            return authResponse(
              ok({
                kind: "authenticated",
                session: (
                  (await session.json()) as {
                    value: ReturnType<typeof sessionProjection>;
                  }
                ).value,
              }),
            );
          if (session.status !== 401) return session;
          const setup = await storage.transaction((tx) => tx.lockSetup());
          return authResponse(ok({ kind: setup === "open" ? "setup-required" : "signed-out" }));
        }
        if (path === "/api/auth/session") return callLibrary(request, "session");
        if (path === "/api/auth/sign-out") return callLibrary(request, "sign-out");
        if (path === "/api/development-inbox/messages") return authResponse(ok(inbox.list()));
        if (openMessage) {
          const entry = inbox.open(decodeURIComponent(openMessage[1] ?? ""));
          return entry ? authResponse(ok(entry)) : authResponse({ kind: "not-found" }, 404);
        }
        const body = await jsonBody(request);
        if (path === "/api/auth/setup" || path === "/api/auth/sign-in") {
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
            result.kind === "temporary-failure"
              ? 503
              : result.kind === "email-not-allowed"
                ? 403
                : 409,
          );
        }
        if (path === "/api/auth/confirm")
          return callLibrary(request, "confirm", { kind: "link", input: parseLink(body) });
        if (path === "/api/auth/activity")
          return callLibrary(request, "confirm", { kind: "activity" });
        if (path === "/api/auth/entry")
          return callLibrary(request, "confirm", { kind: "entry", input: body });
        if (path === "/api/auth/confirm/preview") {
          const result = await credentials.preview(parseLink(body));
          if (result.kind === "failure")
            return authResponse(
              result.failure,
              result.failure.kind === "setup-complete" ? 409 : 400,
              { "Referrer-Policy": "no-referrer" },
            );
          return authResponse(ok({ email: result.email, purpose: result.purpose }), 200, {
            "Referrer-Policy": "no-referrer",
          });
        }
        return authResponse({ kind: "not-found" }, 404);
      } catch {
        emit({ kind: "storage-unavailable" });
        return authResponse({ kind: "temporary-failure" }, 503);
      }
    },
    close: () => credentials.close(),
  };
}
