import { expect, test } from "vite-plus/test";
import { runReviewPasses, reviewPayload, validateReviewPasses } from "./reviews.ts";
import { type Finding, type Job } from "./index.ts";
import { snapshot } from "./fixtures.ts";

const job: Job = {
  version: 1,
  id: "1".repeat(64),
  task: "review",
  role: "reviewer",
  requester: snapshot.author,
  snapshot,
  instructions: "Check the changed value",
  thread: "",
  control: "e".repeat(40),
  selection: { model: "fixture", effort: "high" },
  previous: "",
};
const finding: Finding = {
  severity: "high",
  path: "src/value.ts",
  startLine: 1,
  endLine: 1,
  quote: "value = 1",
  consequence: "The API returns the wrong value.",
  correction: "Use zero.",
};
const empty = { findings: [], unverified: 0 };

test("one request runs separate correctness and quality prompts on the same revision", async () => {
  const calls: string[] = [];
  const result = await runReviewPasses(job, "Keep modules deep.", async (selection, message) => {
    expect(selection).toEqual(job.selection);
    calls.push(message);
    return empty;
  });
  expect(result).toEqual({ correctness: empty, quality: empty });
  expect(calls).toHaveLength(2);
  expect(calls[0]).toContain("Your lens is adversarial correctness.");
  expect(calls[1]).toContain("Your lens is quality and conformance.");
  expect(calls[0]).not.toContain("Keep modules deep.");
  expect(calls[1]).toContain("Keep modules deep.");
  expect(calls.every((message) => message.includes(snapshot.head))).toBe(true);
});

test("a failed pass cannot produce a complete review", async () => {
  await expect(
    runReviewPasses(job, "Rules", async (_selection, message) => {
      if (message.includes("adversarial correctness")) throw new Error("Provider unavailable");
      return empty;
    }),
  ).rejects.toThrow("Provider unavailable");
  expect(() => validateReviewPasses({ correctness: empty }, snapshot)).toThrow();
});

test("one compact review combines both passes, orders severity, and attaches inline findings", async () => {
  const payload = await reviewPayload(job, {
    correctness: { findings: [finding], unverified: 0 },
    quality: {
      findings: [
        {
          ...finding,
          severity: "advisory",
          consequence: "The name hides the unit.",
          correction: "Include the unit in the name.",
        },
        { ...finding, severity: "medium" },
      ],
      unverified: 0,
    },
  });
  expect(payload.event).toBe("COMMENT");
  expect(payload.commit_id).toBe(snapshot.head);
  expect(payload.body).toContain("Correctness + quality");
  expect(payload.body).toContain("**High**");
  expect(payload.body).toContain("**Advisory**");
  expect(payload.body.indexOf("**High**")).toBeLessThan(payload.body.indexOf("**Advisory**"));
  expect(payload.comments).toHaveLength(3);
  expect(payload.comments[0]).toMatchObject({ path: finding.path, line: 1, side: "RIGHT" });
  expect(payload.comments[0]?.body).toContain("Use zero.");
  expect(payload.comments.map((comment) => comment.body.split("\n")[0])).toEqual([
    "**High** · correctness",
    "**Medium** · quality",
    "**Advisory** · quality",
  ]);
  expect(payload.body).not.toContain("Evidence:");
  expect(payload.body.length).toBeLessThan(1200);
});

test("findings outside the diff stay in the top-level body with their correction", async () => {
  const payload = await reviewPayload(
    { ...job, snapshot: { ...snapshot, files: [{ ...snapshot.files[0]!, patch: "" }] } },
    {
      correctness: { findings: [finding], unverified: 0 },
      quality: empty,
    },
  );
  expect(payload.comments).toEqual([]);
  expect(payload.body).toContain("The API returns the wrong value.");
  expect(payload.body).toContain("Use zero.");
});

test("context gaps and truncated patches cannot invent an inline location", async () => {
  const value = "one\ntwo\nthree\nfour\nfive\n";
  const changed = {
    ...snapshot,
    files: [
      {
        ...snapshot.files[0]!,
        text: value,
        patch: "@@ -1 +1 @@\n-one\n+one\n@@ -5 +5 @@\n-five\n+five",
      },
    ],
  };
  const span = { ...finding, startLine: 1, endLine: 5, quote: "one" };
  const payload = await reviewPayload(
    { ...job, snapshot: changed },
    {
      correctness: { findings: [span], unverified: 0 },
      quality: empty,
    },
  );
  expect(payload.comments).toEqual([]);
  expect(payload.body).toContain("Use zero.");
  const truncated = await reviewPayload(
    {
      ...job,
      snapshot: {
        ...snapshot,
        files: [{ ...snapshot.files[0]!, patch: "@@ -1,9 +1,9 @@\n+truncated" }],
      },
    },
    {
      correctness: { findings: [finding], unverified: 0 },
      quality: empty,
    },
  );
  expect(truncated.comments).toEqual([]);
});

test("a multiline finding attaches only when its entire range is in one diff hunk", async () => {
  const changed = {
    ...snapshot,
    files: [
      {
        ...snapshot.files[0]!,
        text: "one\ntwo\nthree\n",
        patch: "@@ -1,2 +1,3 @@\n one\n+two\n three",
      },
    ],
  };
  const payload = await reviewPayload(
    { ...job, snapshot: changed },
    {
      correctness: {
        findings: [{ ...finding, startLine: 1, endLine: 3, quote: "one" }],
        unverified: 0,
      },
      quality: empty,
    },
  );
  expect(payload.comments[0]).toMatchObject({
    start_line: 1,
    start_side: "RIGHT",
    line: 3,
    side: "RIGHT",
  });
});

test("an empty review names both completed passes without claiming full repository coverage", async () => {
  const payload = await reviewPayload(
    { ...job, snapshot: { ...snapshot, complete: false, omitted: ["large.ts"] } },
    { correctness: empty, quality: empty },
  );
  expect(payload.body).toContain("No findings");
  expect(payload.body).toContain("INCOMPLETE");
  expect(payload.body).toContain("large.ts");
  expect(payload.body).toContain(snapshot.head);
  expect(payload.comments).toEqual([]);
});

test("an oversized combined review fails visibly instead of dropping findings", async () => {
  const path = "a".repeat(496) + ".tsx";
  const source = { ...snapshot, files: [{ ...snapshot.files[0]!, path, patch: "" }] };
  const pass = (prefix: string) => ({
    findings: Array.from({ length: 29 }, (_, index) => ({
      ...finding,
      path,
      consequence: `${prefix}${index}`.padEnd(360, "x"),
      correction: "y".repeat(360),
    })),
    unverified: 0,
  });
  const reviews = validateReviewPasses({ correctness: pass("C"), quality: pass("Q") }, source);
  await expect(reviewPayload({ ...job, snapshot: source }, reviews)).rejects.toThrow("body limit");
});

test("an unverifiable finding is dropped and counted while the verified findings still publish", async () => {
  const invented = {
    ...finding,
    quote: "export const value = 2;",
    consequence: "The invented quote claims a crash.",
  };
  const passes = await runReviewPasses(job, "Rules", async (_selection, message) =>
    message.includes("adversarial correctness") ? { findings: [finding, invented] } : empty,
  );
  const published = await reviewPayload(
    job,
    validateReviewPasses(JSON.parse(JSON.stringify(passes)), snapshot),
  );
  expect(published.body).toContain("The API returns the wrong value.");
  expect(published.body).not.toContain("The invented quote claims a crash.");
  expect(published.comments).toHaveLength(1);
  expect(published.comments[0]?.body).not.toContain("invented");
  expect(published.body).toContain(
    "Dropped 1 finding whose quoted evidence is not in the reviewed file.",
  );
});

test("a pass whose every finding is unverifiable still completes with only the dropped count", async () => {
  const unverifiable = [
    { ...finding, quote: "missing" },
    { ...finding, path: "src/absent.ts" },
    { ...finding, startLine: 2, endLine: 2 },
    { ...finding, startLine: 1, endLine: 9 },
  ];
  const passes = await runReviewPasses(job, "Rules", async (_selection, message) =>
    message.includes("quality and conformance") ? { findings: unverifiable } : empty,
  );
  const published = await reviewPayload(job, passes);
  expect(published.comments).toEqual([]);
  expect(published.body).toContain("No findings");
  expect(published.body).toContain(
    "Dropped 4 findings whose quoted evidence is not in the reviewed file.",
  );
});

test("trust-boundary checks on a finding still fail the whole pass", async () => {
  const invalid = [
    { ...finding, path: "../secret.ts" },
    { ...finding, severity: "urgent" },
    { ...finding, consequence: "" },
    { ...finding, quote: "missing", correction: "" },
  ];
  for (const bad of invalid)
    await expect(
      runReviewPasses(job, "Rules", async () => ({ findings: [finding, bad] })),
    ).rejects.toThrow();
  expect(() =>
    validateReviewPasses(
      { correctness: { ...empty, unverified: -1 }, quality: { ...empty, unverified: 0 } },
      snapshot,
    ),
  ).toThrow();
});
