import { createHash, randomBytes, randomUUID } from "node:crypto";
import { AuthStorageError } from "@aircastle/core";
import type {
  AuthEvent,
  AuthLinkRecord,
  AuthStore,
  AuthTransaction,
  AuthUserRecord,
  ProtectedDestination,
} from "@aircastle/core";
import type {
  DevelopmentInbox,
  DevelopmentInboxPublication,
  EmailMessage,
} from "../development-inbox/index.ts";

export type LinkInput = { purpose: "setup" | "sign-in"; token: string };
export type AccountInput =
  | { purpose: "setup"; name: string; email: string; returnTo: ProtectedDestination | null }
  | { purpose: "sign-in"; email: string; returnTo: ProtectedDestination | null };
type LinkFailure =
  | { kind: "invalid-link" | "superseded-link"; next: "setup" | "sign-in" }
  | { kind: "setup-complete" };

const digest = (token: string) => createHash("sha256").update(token).digest("hex");
const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ??
      character,
  );

function message(record: AuthLinkRecord, token: string, origin: string): EmailMessage {
  const setup = record.identity.purpose === "setup";
  const heading = setup
    ? "Confirm your email to create your account."
    : "Use this link to sign in.";
  const name = record.identity.purpose === "setup" ? record.identity.name : record.email;
  const url = `${origin}/${setup ? "setup" : "sign-in"}?token=${encodeURIComponent(token)}`;
  return {
    messageId: record.messageId,
    date: new Date(record.issuedAt).toISOString(),
    from: "Aircastle <no-reply@aircastle.test>",
    to: [record.email],
    subject: setup ? "Create your Aircastle account" : "Sign in to Aircastle",
    text: `${heading}\n\n${name}\n${record.email}\n\nContinue: ${url}\n\nThis link expires in 5 minutes.`,
    html: `<p>${heading}</p><p>${escapeHtml(name)}<br>${escapeHtml(record.email)}</p><p><a href="${escapeHtml(url)}">Continue</a></p><p>This link expires in 5 minutes.</p>`,
  };
}

export function createCredentials(options: {
  storage: AuthStore;
  inbox: DevelopmentInbox;
  clock: () => number;
  emit: (event: AuthEvent) => void;
  origin: string;
  initialEmail?: string;
}) {
  const pending = new Map<string, { email: string; publication: DevelopmentInboxPublication }>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  let reconciling: Promise<void> | undefined;

  async function resolve(messageId: string): Promise<"committed" | "not-committed"> {
    const capture = pending.get(messageId);
    if (!capture) throw new AuthStorageError("unavailable");
    const result = await options.storage.resolveIssuance({ messageId, email: capture.email });
    if (result === "committed") capture.publication.commit();
    else capture.publication.abort();
    pending.delete(messageId);
    return result;
  }

  function schedule() {
    if (closed || timer || pending.size === 0) return;
    timer = setTimeout(() => {
      timer = undefined;
      reconciling = (async () => {
        for (const messageId of pending.keys()) {
          try {
            await resolve(messageId);
          } catch {
            options.emit({ kind: "storage-unavailable" });
          }
        }
      })().finally(() => {
        reconciling = undefined;
        schedule();
      });
    }, 1_000);
    timer.unref();
  }

  async function inspect(tx: AuthTransaction, input: LinkInput) {
    const preliminary = await tx.link(digest(input.token));
    const setup = await tx.lockSetup();
    if (preliminary) await tx.lockEmail(preliminary.email);
    const record = preliminary ? await tx.link(digest(input.token)) : null;
    const next = setup === "open" ? "setup" : "sign-in";
    let failure: LinkFailure | undefined;
    if (
      !/^[A-Za-z0-9_-]{43}$/.test(input.token) ||
      !record ||
      record.identity.purpose !== input.purpose ||
      record.expiresAt <= options.clock() ||
      record.status === "consumed"
    )
      failure = { kind: "invalid-link", next };
    else if (record.status === "superseded") failure = { kind: "superseded-link", next };
    else if (record.identity.purpose === "setup" && setup === "complete")
      failure = { kind: "setup-complete" };
    else if (record.identity.purpose === "sign-in" && !(await tx.userById(record.identity.userId)))
      failure = { kind: "invalid-link", next };
    if (failure) {
      options.emit({ kind: "sign-in-failed", reason: failure.kind });
      return { kind: "failure" as const, failure };
    }
    if (!record) throw new AuthStorageError("unavailable");
    return { kind: "valid" as const, record };
  }

  return {
    async issue(input: AccountInput) {
      let publication: DevelopmentInboxPublication | undefined;
      let messageId: string | undefined;
      try {
        const outcome = await options.storage.transaction(async (tx) => {
          const setup = await tx.lockSetup();
          await tx.lockEmail(input.email);
          let identity: AuthLinkRecord["identity"];
          if (input.purpose === "setup") {
            if (setup === "complete") return { kind: "setup-complete" as const };
            if (options.initialEmail && input.email !== options.initialEmail)
              return { kind: "email-not-allowed" as const };
            identity = { purpose: "setup", name: input.name };
          } else {
            if (setup === "open") return { kind: "setup-required" as const };
            const user = await tx.userByEmail(input.email);
            if (!user) {
              options.emit({ kind: "sign-in-failed", reason: "unknown-identity" });
              return { kind: "issued" as const };
            }
            identity = { purpose: "sign-in", userId: user.id };
          }
          const token = randomBytes(32).toString("base64url");
          const at = options.clock();
          const record: AuthLinkRecord = {
            digest: digest(token),
            messageId: randomUUID(),
            email: input.email,
            identity,
            issuedAt: at,
            expiresAt: at + 300_000,
            status: "active",
            returnTo: input.returnTo,
          };
          try {
            publication = await options.inbox.prepare(message(record, token, options.origin));
          } catch {
            options.emit({ kind: "delivery-failed" });
            return { kind: "temporary-failure" as const };
          }
          messageId = record.messageId;
          await tx.replaceLink(record);
          return { kind: "issued" as const };
        });
        if (outcome.kind === "issued") publication?.commit();
        else publication?.abort();
        return outcome;
      } catch (error) {
        options.emit({ kind: "storage-unavailable" });
        if (
          publication &&
          messageId &&
          error instanceof AuthStorageError &&
          error.kind === "commit-unknown"
        ) {
          pending.set(messageId, { email: input.email, publication });
          try {
            if ((await resolve(messageId)) === "committed") return { kind: "issued" as const };
          } catch {
            schedule();
          }
        } else publication?.abort();
        return { kind: "temporary-failure" as const };
      }
    },
    async preview(input: LinkInput) {
      return options.storage.transaction(async (tx) => {
        const result = await inspect(tx, input);
        return result.kind === "valid"
          ? {
              kind: "preview" as const,
              email: result.record.email,
              purpose: result.record.identity.purpose,
            }
          : result;
      });
    },
    async confirm<Pair>(
      tx: AuthTransaction,
      input: LinkInput,
      createUser: (name: string, email: string, at: number) => Promise<AuthUserRecord>,
      createSession: (user: AuthUserRecord, at: number) => Promise<Pair>,
    ) {
      const result = await inspect(tx, input);
      if (result.kind === "failure") return result;
      const { record } = result;
      const at = options.clock();
      if (!(await tx.consumeLink(record.digest)))
        return {
          kind: "failure" as const,
          failure: {
            kind: "invalid-link" as const,
            next: record.identity.purpose === "setup" ? ("setup" as const) : ("sign-in" as const),
          },
        };
      const user =
        record.identity.purpose === "setup"
          ? await createUser(record.identity.name, record.email, at)
          : await tx.userById(record.identity.userId);
      if (!user) throw new AuthStorageError("unavailable");
      if (record.identity.purpose === "setup") await tx.completeSetup(user.id);
      const pair = await createSession(user, at);
      let destination: ProtectedDestination | { kind: "dashboard" } = { kind: "dashboard" };
      if (record.returnTo && (await tx.authorize(user.id, record.returnTo))) {
        destination = record.returnTo;
        const entry = await tx.entry(user.id);
        await tx.saveEntry(user.id, { ...entry, onboardingOffered: true });
      }
      return { kind: "confirmed" as const, pair, destination };
    },
    async close() {
      closed = true;
      if (timer) clearTimeout(timer);
      await reconciling;
    },
  };
}
