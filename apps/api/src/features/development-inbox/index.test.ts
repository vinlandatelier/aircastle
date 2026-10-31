import { expect, test } from "vite-plus/test";
import { createDevelopmentInbox, type EmailMessage } from "./index.ts";

function email(overrides: Partial<EmailMessage> = {}): EmailMessage {
  return {
    messageId: "setup-message-1",
    date: "2026-10-25T03:04:05.678Z",
    from: "Aircastle <no-reply@aircastle.test>",
    to: ["alex@example.test", "another@example.test"],
    subject: "Create your Aircastle account",
    html: '<p>Alex &amp; Sam, confirm your email to create your account.</p><a href="http://localhost:3000/complete?token=setup-token">Continue</a><p>This link expires in 5 minutes.</p>',
    text: "Alex & Sam, confirm your email to create your account.\nhttp://localhost:3000/complete?token=setup-token\nThis link expires in 5 minutes.",
    ...overrides,
  };
}

test("a new inbox is empty and opening a missing message leaves it empty", () => {
  const inbox = createDevelopmentInbox();

  expect(inbox.list()).toEqual([]);
  expect(inbox.open("missing-message")).toBeUndefined();
  expect(inbox.list()).toEqual([]);
});

test("preparation keeps a message invisible until synchronous commit publishes it unread", async () => {
  const inbox = createDevelopmentInbox();
  const message = email();
  const preparation = inbox.prepare(message);

  expect(inbox.list()).toEqual([]);
  expect(inbox.open(message.messageId)).toBeUndefined();

  const publication = await preparation;
  expect(inbox.list()).toEqual([]);
  expect(inbox.open(message.messageId)).toBeUndefined();

  expect(publication.commit()).toBeUndefined();
  expect(inbox.list()).toEqual([{ mail: message, read: false }]);
});

test("aborting preparation does not publish a message", async () => {
  const inbox = createDevelopmentInbox();
  const message = email();
  const publication = await inbox.prepare(message);

  expect(publication.abort()).toBeUndefined();
  expect(inbox.list()).toEqual([]);
  expect(inbox.open(message.messageId)).toBeUndefined();
});

test("preparing and aborting a replacement leaves captured messages and their read state unchanged", async () => {
  const inbox = createDevelopmentInbox();
  const original = email();
  const originalPublication = await inbox.prepare(original);
  originalPublication.commit();
  expect(inbox.open(original.messageId)).toEqual({ mail: original, read: true });

  const replacement = email({ messageId: "replacement-message" });
  const publication = await inbox.prepare(replacement);
  expect(inbox.list()).toEqual([{ mail: original, read: true }]);
  expect(inbox.open(replacement.messageId)).toBeUndefined();

  publication.abort();
  expect(inbox.list()).toEqual([{ mail: original, read: true }]);
  expect(inbox.open(replacement.messageId)).toBeUndefined();
});

test("list and open retain the complete email without changing its headers or bodies", async () => {
  const inbox = createDevelopmentInbox();
  const message = email();
  const expected = email();
  const publication = await inbox.prepare(message);
  publication.commit();

  expect(inbox.list()).toEqual([{ mail: expected, read: false }]);
  expect(inbox.open("setup-message-1")).toEqual({ mail: expected, read: true });
  expect(inbox.list()).toEqual([{ mail: expected, read: true }]);
});

test("plain-text email remains complete when HTML is absent", async () => {
  const inbox = createDevelopmentInbox();
  const message: EmailMessage = {
    messageId: "plain-text-message",
    date: "Sun, 25 Oct 2026 03:04:05 +0000",
    from: "Aircastle <no-reply@aircastle.test>",
    to: ["alex@example.test"],
    subject: "Sign in to Aircastle",
    text: "Use this link to sign in.\nhttp://localhost:3000/complete?token=signin-token\nThis link expires in 5 minutes.",
  };
  const expected = structuredClone(message);
  const publication = await inbox.prepare(message);
  publication.commit();

  expect(inbox.list()).toEqual([{ mail: expected, read: false }]);
  expect(inbox.open("plain-text-message")).toEqual({ mail: expected, read: true });
});

test("lists newer messages before older messages", async () => {
  const inbox = createDevelopmentInbox();
  const older = email({ messageId: "older", date: "2026-10-25T03:00:00.000Z" });
  const newer = email({ messageId: "newer", date: "2026-10-25T04:00:00.000Z" });
  const olderPublication = await inbox.prepare(older);
  olderPublication.commit();
  const newerPublication = await inbox.prepare(newer);
  newerPublication.commit();

  expect(inbox.list()).toEqual([
    { mail: newer, read: false },
    { mail: older, read: false },
  ]);
});

test("equal dates put the latest committed message first regardless of preparation order", async () => {
  const inbox = createDevelopmentInbox();
  const first = email({ messageId: "first-prepared" });
  const second = email({ messageId: "second-prepared" });
  const firstPublication = await inbox.prepare(first);
  const secondPublication = await inbox.prepare(second);
  secondPublication.commit();
  firstPublication.commit();

  expect(inbox.list()).toEqual([
    { mail: first, read: false },
    { mail: second, read: false },
  ]);
});

test("keeps exactly the newest 100 committed messages and evicts older messages", async () => {
  const inbox = createDevelopmentInbox();
  for (let index = 0; index < 103; index++) {
    const publication = await inbox.prepare(email({ messageId: `message-${index}` }));
    publication.commit();
  }

  expect(inbox.list().map((entry) => entry.mail.messageId)).toEqual(
    Array.from({ length: 100 }, (_, index) => `message-${102 - index}`),
  );
  for (const messageId of ["message-0", "message-1", "message-2"]) {
    expect(inbox.open(messageId)).toBeUndefined();
  }
  expect(inbox.open("message-3")?.mail.messageId).toBe("message-3");
});

test("opening a message shares its read state with every caller of the same inbox", async () => {
  const inbox = createDevelopmentInbox();
  const firstCaller = { list: () => inbox.list() };
  const secondCaller = { list: () => inbox.list(), open: (id: string) => inbox.open(id) };
  const message = email();
  const other = email({ messageId: "other-message" });
  for (const mail of [message, other]) {
    const publication = await inbox.prepare(mail);
    publication.commit();
  }

  expect(firstCaller.list()).toEqual([
    { mail: other, read: false },
    { mail: message, read: false },
  ]);
  expect(secondCaller.open(message.messageId)).toEqual({ mail: message, read: true });
  const expected = [
    { mail: other, read: false },
    { mail: message, read: true },
  ];
  expect(firstCaller.list()).toEqual(expected);
  expect(secondCaller.list()).toEqual(expected);
  expect(secondCaller.open(message.messageId)).toEqual({ mail: message, read: true });
  expect(firstCaller.list()).toEqual(expected);

  const newest = email({ messageId: "newest-message" });
  const newestPublication = await inbox.prepare(newest);
  newestPublication.commit();
  expect(firstCaller.list()).toEqual([{ mail: newest, read: false }, ...expected]);
  expect(secondCaller.list()).toEqual([{ mail: newest, read: false }, ...expected]);
});

test("opening a missing message preserves captured messages, order, and unread state", async () => {
  const inbox = createDevelopmentInbox();
  const message = email();
  const newer = email({ messageId: "newer-message" });
  for (const mail of [message, newer]) {
    const publication = await inbox.prepare(mail);
    publication.commit();
  }
  expect(inbox.open(message.messageId)).toEqual({ mail: message, read: true });
  const expected = [
    { mail: newer, read: false },
    { mail: message, read: true },
  ];

  expect(inbox.list()).toEqual(expected);
  expect(inbox.open("missing-message")).toBeUndefined();
  expect(inbox.list()).toEqual(expected);
});

test.each(["before commit", "after commit"])(
  "mutating the input %s cannot change the captured email",
  async (timing) => {
    const inbox = createDevelopmentInbox();
    const recipients = ["alex@example.test", "another@example.test"];
    const message = email({ to: recipients });
    const original = email();
    const publication = await inbox.prepare(message);
    if (timing === "after commit") publication.commit();

    for (const key of ["messageId", "date", "from", "subject", "html", "text"]) {
      Reflect.set(message, key, "changed");
    }
    Reflect.set(message, "to", ["changed@example.test"]);
    Reflect.set(recipients, "0", "changed@example.test");
    Reflect.set(recipients, "length", 0);
    if (timing === "before commit") publication.commit();

    expect(inbox.list()).toEqual([{ mail: original, read: false }]);
    expect(inbox.open(original.messageId)).toEqual({ mail: original, read: true });
  },
);

test.each(["list", "open"])(
  "mutating the %s result cannot corrupt the inbox",
  async (operation) => {
    const inbox = createDevelopmentInbox();
    const message = email();
    const publication = await inbox.prepare(message);
    publication.commit();
    const entries = inbox.list();
    const entry = operation === "list" ? entries[0] : inbox.open(message.messageId);
    const read = operation === "open";
    expect(entry).toEqual({ mail: message, read });
    if (entry === undefined) throw new Error("Published message is missing");

    for (const key of ["messageId", "date", "from", "subject", "html", "text"]) {
      Reflect.set(entry.mail, key, "changed");
    }
    Reflect.set(entry.mail.to, "0", "changed@example.test");
    Reflect.set(entry.mail.to, "length", 0);
    Reflect.set(entry.mail, "to", ["changed@example.test"]);
    Reflect.set(entry, "mail", email({ messageId: "changed" }));
    Reflect.set(entry, "read", !read);
    Reflect.set(entries, "0", { mail: email({ messageId: "changed" }), read: !read });
    Reflect.set(entries, "length", 0);

    expect(inbox.list()).toEqual([{ mail: email(), read }]);
    expect(inbox.open("setup-message-1")).toEqual({ mail: email(), read: true });
  },
);

test("a new factory starts with empty memory independently of an existing inbox", async () => {
  const originalInbox = createDevelopmentInbox();
  const message = email();
  const publication = await originalInbox.prepare(message);
  publication.commit();
  expect(originalInbox.open(message.messageId)).toEqual({ mail: message, read: true });

  const freshInbox = createDevelopmentInbox();
  expect(freshInbox.list()).toEqual([]);
  expect(freshInbox.open(message.messageId)).toBeUndefined();
  expect(originalInbox.list()).toEqual([{ mail: message, read: true }]);
});

test("repeated publication does not duplicate or reset an already read message", async () => {
  const inbox = createDevelopmentInbox();
  const message = email();
  const publication = await inbox.prepare(message);
  publication.commit();
  expect(inbox.open(message.messageId)).toEqual({ mail: message, read: true });
  expect(() => publication.commit()).not.toThrow();
  expect(() => publication.abort()).not.toThrow();
  expect(inbox.list()).toEqual([{ mail: message, read: true }]);
});

test("an aborted reservation stays unpublished when cleanup is repeated", async () => {
  const inbox = createDevelopmentInbox();
  const visible = email({ messageId: "visible" });
  (await inbox.prepare(visible)).commit();
  expect(inbox.list()).toEqual([{ mail: visible, read: false }]);
  const publication = await inbox.prepare(email({ messageId: "cancelled" }));
  publication.abort();
  expect(() => publication.abort()).not.toThrow();
  expect(() => publication.commit()).not.toThrow();
  expect(inbox.list()).toEqual([{ mail: visible, read: false }]);
});
