import { randomUUID } from "node:crypto";
import postgres from "postgres";
import pino from "pino";
import type { Logger } from "pino";
import {
  postgresAdapter,
  postgresAuthAdmission,
  postgresAuthStore,
} from "@aircastle/adapter-postgres";
import { AuthStorageError, createAircastle } from "@aircastle/core";
import type { AuthEvent, AuthLimits, AuthStore } from "@aircastle/core";
import { expect } from "vite-plus/test";
import { cmsErrorReporter, createApp } from "../../../app.ts";
import { createDevelopmentInbox } from "../../development-inbox/index.ts";
import type { DevelopmentInbox, EmailMessage } from "../../development-inbox/index.ts";
import { createAuthEventLogger, createLocalAuth } from "../index.ts";
import type { LocalAuthRuntime } from "../index.ts";

export const start = Date.UTC(2026, 0, 1);
export const browserOrigin = "http://localhost:43121";
export const limits = {
  email: { fiveMinutes: 1_000, oneHour: 1_000 },
  ip: { fiveMinutes: 1_000, oneHour: 1_000 },
  global: { fiveMinutes: 1_000, oneHour: 1_000 },
};

export async function withAuth(
  run: (fixture: AuthFixture) => Promise<void>,
  options: {
    limits?: AuthLimits;
    logger?: Logger;
    maxRequestBytes?: number;
    storage?: (store: AuthStore) => AuthStore;
    onPrepare?: (mail: EmailMessage) => void;
  } = {},
) {
  const url = process.env.AIRCASTLE_DATABASE_URL;
  if (!url) throw new Error("Run through vp run db:test");
  const namespace = `auth_${randomUUID().replaceAll("-", "")}`;
  const sql = postgres(url, { max: 5, onnotice: () => {} });
  const content = postgresAdapter({ url, namespace });
  const runtimes: LocalAuthRuntime[] = [];
  const stores: AuthStore[] = [];
  let now = start;
  let captureFails = false;
  let storageFault: "none" | "session" | "replacement" | "commit" | "ack" = "none";
  const events: AuthEvent[] = [];
  const logs: string[] = [];
  const prepared: EmailMessage[] = [];
  const logger = options.logger ?? pino({ level: "info" }, { write: (line) => logs.push(line) });
  const logAuthEvent = createAuthEventLogger(logger);
  let nextIssuanceCommit: (() => void) | undefined;
  try {
    const cms = await createAircastle({ database: content, report: cmsErrorReporter(logger) });
    expect((await sql`SELECT 1 AS connected`)[0]?.connected).toBe(1);
    const open = async (initialEmail?: string, storageUrl = url) => {
      const storage = await postgresAuthStore({ url: storageUrl, namespace });
      stores.push(storage);
      const admission = await postgresAuthAdmission({
        url,
        namespace,
        limits: options.limits ?? limits,
        clock: () => now,
      });
      const inbox = createDevelopmentInbox();
      const delivery: DevelopmentInbox = {
        list: () => inbox.list(),
        open: (id) => inbox.open(id),
        prepare: async (mail) => {
          options.onPrepare?.(mail);
          if (captureFails) throw new Error("test capture preparation failure");
          const publication = await inbox.prepare(mail);
          prepared.push(mail);
          return publication;
        },
      };
      const faulted: AuthStore = {
        ...storage,
        transaction: async (work) => {
          const result = await storage.transaction(async (transaction) => {
            const value = await work({
              ...transaction,
              insertSession: async (record) => {
                const saved = await transaction.insertSession(record);
                if (storageFault === "session") throw new AuthStorageError("unavailable");
                return saved;
              },
              replaceLink: async (record) => {
                await transaction.replaceLink(record);
                if (storageFault === "replacement") throw new AuthStorageError("unavailable");
                const hook = nextIssuanceCommit;
                nextIssuanceCommit = undefined;
                hook?.();
              },
            });
            if (storageFault === "commit") throw new AuthStorageError("unavailable");
            return value;
          });
          if (storageFault === "ack") throw new AuthStorageError("commit-unknown");
          return result;
        },
      };
      const auth = await createLocalAuth({
        config: {
          mode: "development",
          browserOrigin,
          limits: options.limits ?? limits,
          ...(initialEmail === undefined ? {} : { initialEmail }),
        },
        storage: options.storage?.(faulted) ?? faulted,
        admission,
        clock: () => now,
        inbox: delivery,
        emit: (event) => {
          events.push(event);
          logAuthEvent(event);
        },
      });
      runtimes.push({
        handle: (request, peer) => auth.handle(request, peer),
        close: async () => {
          await auth.close();
          await admission.close();
        },
      });
      const app = createApp({
        logger,
        cms,
        auth,
        ...(options.maxRequestBytes === undefined
          ? {}
          : { maxRequestBytes: options.maxRequestBytes }),
      });
      const request = async (
        path: string,
        body?: unknown,
        cookie?: string,
        headers: RequestInit["headers"] = {},
        peerAddress = "127.0.0.1",
      ) => {
        const supplied = new Headers(headers);
        if (!supplied.has("host")) supplied.set("host", new URL(browserOrigin).host);
        if (!supplied.has("origin")) supplied.set("origin", browserOrigin);
        if (cookie) supplied.set("cookie", cookie);
        if (body !== undefined) supplied.set("content-type", "application/json");
        return app.request(
          `${browserOrigin}/api${path}`,
          {
            method: body === undefined ? "GET" : "POST",
            headers: supplied,
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          },
          { peerAddress },
        );
      };
      return { request, inbox, storage, app, auth };
    };
    await run({
      sql,
      namespace,
      url,
      content,
      cms,
      open,
      events,
      logs,
      prepared,
      at: (milliseconds) => {
        now = start + milliseconds;
      },
      captureFailure: (enabled) => {
        captureFails = enabled;
      },
      nextIssuanceCommit: (hook) => {
        nextIssuanceCommit = hook;
      },
      storageFailure: (fault) => {
        storageFault = fault;
      },
    });
  } finally {
    await Promise.allSettled(runtimes.map((runtime) => runtime.close()));
    await Promise.allSettled(stores.map((store) => store.close()));
    await content.close();
    await sql`DROP SCHEMA IF EXISTS ${sql(namespace)} CASCADE`;
    await sql.end();
  }
}

export interface AuthFixture {
  sql: ReturnType<typeof postgres>;
  namespace: string;
  url: string;
  content: ReturnType<typeof postgresAdapter>;
  cms: Awaited<ReturnType<typeof createAircastle>>;
  open: (
    initialEmail?: string,
    storageUrl?: string,
  ) => Promise<{
    request: (
      path: string,
      body?: unknown,
      cookie?: string,
      headers?: RequestInit["headers"],
      peerAddress?: string,
    ) => Promise<Response>;
    inbox: DevelopmentInbox;
    storage: AuthStore;
    app: ReturnType<typeof createApp>;
    auth: LocalAuthRuntime;
  }>;
  events: AuthEvent[];
  logs: string[];
  prepared: EmailMessage[];
  at: (milliseconds: number) => void;
  captureFailure: (enabled: boolean) => void;
  storageFailure: (fault: "none" | "session" | "replacement" | "commit" | "ack") => void;
  nextIssuanceCommit: (hook: () => void) => void;
}

export type AuthServer = Awaited<ReturnType<AuthFixture["open"]>>;

export async function issue(server: AuthServer, email = "alex@example.test", name = "Alex") {
  const response = await server.request("/auth/setup", { name, email });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ kind: "ok", value: { confirmation: "setup-inbox" } });
  const message = server.inbox
    .list()
    .find((entry) => entry.mail.to.includes(email.trim().toLowerCase()));
  expect(message).toBeDefined();
  if (!message) throw new Error("Successful issuance must publish a readable email");
  const link = message.mail.text.match(/https?:\/\/[^\s<>]+/u)?.[0];
  expect(link).toBeDefined();
  if (!link) throw new Error("Captured email must contain the actionable link");
  const token = new URL(link).searchParams.get("token");
  expect(token).toBeTruthy();
  if (!token) throw new Error("Captured link must contain a token");
  return { purpose: "setup" as const, token, message: message.mail, link };
}

export async function claim(server: AuthServer) {
  const link = await issue(server);
  const response = await server.request("/auth/confirm", {
    purpose: link.purpose,
    token: link.token,
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    kind: "ok",
    value: { destination: { kind: "dashboard" } },
  });
  const setCookie = response.headers.get("set-cookie");
  expect(setCookie).toBeTruthy();
  if (!setCookie) throw new Error("Successful confirmation must set a browser cookie");
  return { cookie: setCookie.split(";")[0] ?? "", setCookie, link };
}

export async function signIn(server: AuthServer, email = "alex@example.test") {
  const issued = await server.request("/auth/sign-in", { email });
  expect(issued.status).toBe(200);
  const mail = server.inbox.list().find((entry) => entry.mail.to.includes(email))?.mail;
  expect(mail?.subject).toBe("Sign in to Aircastle");
  const link = mail?.text.match(/https?:\/\/[^\s<>]+/u)?.[0];
  if (!link) throw new Error("Sign-in must publish an actionable link");
  const token = new URL(link).searchParams.get("token");
  if (!token) throw new Error("Sign-in link must contain a token");
  const response = await server.request("/auth/confirm", { purpose: "sign-in", token });
  expect(response.status).toBe(200);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  expect(cookie).toBeTruthy();
  if (!cookie) throw new Error("Sign-in must issue a cookie");
  return { cookie, token };
}
