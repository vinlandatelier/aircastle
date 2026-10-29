import { expect, test } from "vite-plus/test";
import { executeOperation, boundModelOutput } from "./operations.ts";
import { digest, type Job } from "./index.ts";
import { snapshot } from "./fixtures.ts";

const request: Job = {
  version: 1,
  id: "1".repeat(64),
  task: "request",
  role: "claudeReviewer",
  requester: snapshot.author,
  snapshot,
  instructions: "can u pls change this to XYZ",
  thread: "",
  control: "e".repeat(40),
  previous: "",
  selection: { provider: "anthropic", model: "review", effort: "high" },
  implementation: { provider: "anthropic", model: "implement", effort: "high" },
};
const fix = {
  summary: "Correct value.",
  edits: [{ path: "src/value.ts", expectedBlob: "c".repeat(40), content: "fixed\n" }],
};
const empty = { summary: "No findings.", findings: [] };

test("a natural change request selects the captured implementation model without changing its claim", async () => {
  const calls: string[] = [];
  const original = digest(request);
  const result = await executeOperation(request, "Rules", async (selection, message) => {
    calls.push(selection.model);
    return message.startsWith("Classify") ? { kind: "fix", message: "" } : fix;
  });
  expect(calls).toEqual(["review", "implement"]);
  expect(result).toMatchObject({
    id: request.id,
    digest: original,
    task: "fix",
    selection: request.implementation,
    result: fix,
  });
  expect(digest(request)).toBe(original);
  expect(boundModelOutput(request, result)).toEqual(result);
});

test("a natural review runs the intent check and both lenses, with no implementation call", async () => {
  const calls: string[] = [];
  const result = await executeOperation(request, "Rules", async (selection, message) => {
    calls.push(selection.model);
    return message.startsWith("Classify") ? { kind: "review", message: "" } : empty;
  });
  expect(calls).toEqual(["review", "review", "review"]);
  expect(result).toMatchObject({ task: "review", result: { correctness: empty, quality: empty } });
});

test("explicit reviews bypass interpretation and cannot publish a fix result", async () => {
  const review: Job = { ...request, task: "review" };
  let calls = 0;
  const output = await executeOperation(review, "Rules", async (_selection, message) => {
    expect(message).not.toMatch(/^Classify/);
    calls++;
    return empty;
  });
  expect(calls).toBe(2);
  expect(() => boundModelOutput(review, { ...output, task: "fix", result: fix })).toThrow();
});

test("natural fixes still require complete source and bound model, revision, and input artifacts", async () => {
  const partial = { ...request, snapshot: { ...snapshot, complete: false } };
  let calls = 0;
  await expect(
    executeOperation(partial, "Rules", async () => {
      calls++;
      return { kind: "fix", message: "" };
    }),
  ).rejects.toThrow("complete");
  expect(calls).toBe(1);
  const output = await executeOperation(request, "Rules", async (_selection, message) =>
    message.startsWith("Classify") ? { kind: "fix", message: "" } : fix,
  );
  for (const changed of [
    { ...output, id: "2".repeat(64) },
    { ...output, digest: "wrong" },
    { ...output, selection: request.selection },
    { ...output, task: "other" },
  ])
    expect(() => boundModelOutput(request, changed)).toThrow();
});
