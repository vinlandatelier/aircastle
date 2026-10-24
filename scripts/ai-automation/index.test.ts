import { expect, test } from "vite-plus/test";
import { authorize, operationId, parseCommand, validateEdits, validateReview } from "./index.ts";

import { sha, snapshot, invocation } from "./fixtures.ts";

test.each(["@codex", "@codex review", "@codex review check validation", "@codex please review"])(
  "defaults a standalone mention to review: %s",
  (body) => {
    expect(parseCommand(body)?.kind).toBe("review");
  },
);
test("explicit fix commands preserve task instructions and optional expected SHA", () => {
  expect(parseCommand(`@claude fix head=${sha} correct the referenced finding`)).toEqual({
    provider: "anthropic",
    kind: "fix",
    instructions: "correct the referenced finding",
    expectedHead: sha,
  });
});
test.each([
  "> @codex fix",
  "`@codex fix`",
  "```\n@codex fix\n```",
  "<!--\n@codex fix\n-->",
  "@codex fix\n@claude review",
  "text @codex fix",
  "@codexity fix",
])("ignores quoted, ambiguous, or spoofed commands: %s", (body) => {
  expect(parseCommand(body)).toBeNull();
});
test.each(["outside", "unknown"] as const)(
  "%s membership never authorizes or claims an operation",
  async (membership) => {
    expect(await authorize(invocation, { membership: async () => membership })).toEqual({
      kind: "denied",
      reason: membership,
    });
  },
);
test("membership transport errors fail closed", async () => {
  expect(
    await authorize(invocation, {
      membership: async () => {
        throw new Error("403");
      },
    }),
  ).toEqual({ kind: "denied", reason: "unknown" });
});
test("an inline reply author authorizes the command, not the PR author", async () => {
  const identities: string[] = [];
  const command = {
    id: 80,
    author: { id: 21, login: "reply-member", type: "User" },
    body: "@claude fix",
    createdAt: "2026-10-25T00:00:00Z",
    thread: "Finding: incorrect value",
    source: "inline" as const,
  };
  const result = await authorize(
    { ...invocation, kind: "manual", role: "claudeImplementer", command },
    {
      membership: async (login) => {
        identities.push(login);
        return "member";
      },
    },
  );
  expect(result.kind).toBe("authorized");
  expect(identities).toEqual(["reply-member"]);
});
test("automatic operations cannot select implementer roles", async () => {
  expect(
    (
      await authorize(
        { ...invocation, role: "codexImplementer" },
        { membership: async () => "member" },
      )
    ).kind,
  ).toBe("denied");
});
test("an explicit head in a command cannot authorize a different revision", async () => {
  const command = {
    id: 81,
    author: snapshot.author,
    body: `@codex review head=${"f".repeat(40)}`,
    createdAt: "2026-10-25T00:00:00Z",
    thread: "",
    source: "issue" as const,
  };
  expect(
    (
      await authorize(
        { ...invocation, kind: "manual", command },
        { membership: async () => "member" },
      )
    ).kind,
  ).toBe("denied");
});
test("automatic review keys change per revision and provider; manual keys never rebind comments", () => {
  expect(operationId(invocation)).not.toBe(operationId({ ...invocation, role: "claudeReviewer" }));
  expect(operationId(invocation)).not.toBe(
    operationId({ ...invocation, snapshot: { ...snapshot, head: "f".repeat(40) } }),
  );
  const command = {
    id: 82,
    author: snapshot.author,
    body: "@codex",
    createdAt: "2026-10-25T00:00:00Z",
    thread: "",
    source: "issue" as const,
  };
  const manual = { ...invocation, kind: "manual" as const, command };
  expect(operationId(manual)).toBe(
    operationId({ ...manual, snapshot: { ...snapshot, head: "f".repeat(40) } }),
  );
});
test("review findings must cite actual immutable source and a consequence", () => {
  const finding = {
    severity: "high",
    path: "src/value.ts",
    startLine: 1,
    endLine: 1,
    quote: "value = 1",
    consequence: "The API returns the wrong value",
    correction: "Use zero",
  };
  expect(
    validateReview({ summary: "Wrong value", findings: [finding] }, snapshot).findings,
  ).toHaveLength(1);
  expect(() =>
    validateReview(
      { summary: "Wrong value", findings: [{ ...finding, quote: "invented" }] },
      snapshot,
    ),
  ).toThrow();
  expect(() =>
    validateReview({ summary: "Wrong value", findings: [{ ...finding, startLine: 2 }] }, snapshot),
  ).toThrow();
  expect(() =>
    validateReview(
      { summary: "Wrong value", findings: [{ ...finding, consequence: "" }] },
      snapshot,
    ),
  ).toThrow();
});
test("edits require original blobs and allow only bounded normal text files", () => {
  const edit = {
    path: "src/value.ts",
    expectedBlob: "c".repeat(40),
    content: "export const value = 2;\n",
  };
  expect(validateEdits({ summary: "Correct value", edits: [edit] }, snapshot).edits).toEqual([
    edit,
  ]);
  for (const path of [
    "../escape",
    "/tmp/escape",
    "src/../../escape",
    "src\\escape",
    ".git/config",
    ".github/workflows/x.yml",
    "scripts/ai-models/index.ts",
    "package.json",
    "bun.lock",
    "vite.config.ts",
    "src/.env",
    "AGENTS.md",
    "src/test.test.ts",
  ]) {
    expect(
      () => validateEdits({ summary: "Unsafe", edits: [{ ...edit, path }] }, snapshot),
      path,
    ).toThrow();
  }
  expect(() =>
    validateEdits({ summary: "Wrong blob", edits: [{ ...edit, expectedBlob: sha }] }, snapshot),
  ).toThrow();
  expect(() =>
    validateEdits({ summary: "Binary", edits: [{ ...edit, content: "\u0000" }] }, snapshot),
  ).toThrow();
  expect(() =>
    validateEdits(
      { summary: "Symlink", edits: [edit] },
      { ...snapshot, files: [{ ...snapshot.files[0]!, mode: "120000" }] },
    ),
  ).toThrow();
});

test.each(["    @codex fix", "\t@claude fix", "<!-- unclosed\n@codex fix"])(
  "ignores indented code and unclosed HTML quotes: %s",
  (body) => {
    expect(parseCommand(body)).toBeNull();
  },
);
test("a polite explicit fix request selects fix", () => {
  expect(parseCommand("@codex please fix the referenced finding")?.kind).toBe("fix");
});
