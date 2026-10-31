import {
  contextComplete,
  requireObject,
  reviewPrompt,
  reviewSchema,
  validateReview,
  type Finding,
  type Job,
  type Review,
  type ReviewPass,
  type Snapshot,
  threadLimit,
} from "./index.ts";
import { runModel } from "../ai-models/index.ts";

export type ReviewPasses = Record<ReviewPass, Review>;
type InlineComment = {
  path: string;
  body: string;
  line: number;
  side: "RIGHT";
  start_line?: number;
  start_side?: "RIGHT";
};
const rank: Record<Finding["severity"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  advisory: 4,
};
const compact = (value: string) => value.replace(/\s+/g, " ").trim();
const label = (severity: Finding["severity"]) => severity[0]!.toUpperCase() + severity.slice(1);

/** Re-reads review passes from the model job's artifact, keeping each pass's dropped count. */
export function validateReviewPasses(value: unknown, snapshot: Snapshot): ReviewPasses {
  const result = requireObject(value);
  const pass = (raw: unknown): Review => {
    const carried = requireObject(raw).unverified;
    if (!Number.isSafeInteger(carried) || Number(carried) < 0 || Number(carried) > 30)
      throw new Error("Invalid unverified count");
    const review = validateReview(raw, snapshot);
    return { ...review, unverified: review.unverified + Number(carried) };
  };
  return { correctness: pass(result.correctness), quality: pass(result.quality) };
}

export async function runReviewPasses(
  job: Job,
  guidance: string,
  runner: typeof runModel = runModel,
): Promise<ReviewPasses> {
  const concise =
    "Write for rapid reading. Use one short sentence for the consequence and the correction. Omit praise, repeated evidence, and general advice.";
  const [correctness, quality] = await Promise.all(
    (["correctness", "quality"] as const).map(async (pass) =>
      validateReview(
        await runner(
          job.selection,
          `${reviewPrompt({ ...job, task: "review" }, guidance, pass)}\n${concise}`,
          reviewSchema,
        ),
        job.snapshot,
      ),
    ),
  );
  return { correctness: correctness!, quality: quality! };
}

function findings(reviews: ReviewPasses): { finding: Finding; pass: ReviewPass }[] {
  return (["correctness", "quality"] as const)
    .flatMap((pass) => reviews[pass].findings.map((finding) => ({ finding, pass })))
    .sort((a, b) => rank[a.finding.severity] - rank[b.finding.severity]);
}

export async function reviewPayload(
  job: Job,
  reviews: ReviewPasses,
): Promise<{
  event: "COMMENT";
  commit_id: string;
  body: string;
  comments: InlineComment[];
}> {
  const { parsePatch } = await import("diff");
  const rows: string[] = [];
  const comments: InlineComment[] = [];
  const hunks = (patch: string) => {
    try {
      return parsePatch(patch).flatMap((file) =>
        file.hunks.map((hunk) => ({
          first: hunk.newStart,
          last: hunk.newStart + hunk.newLines - 1,
        })),
      );
    } catch {
      return [];
    }
  };
  const ranges = new Map(job.snapshot.files.map((file) => [file.path, hunks(file.patch)] as const));
  for (const { finding, pass } of findings(reviews)) {
    const inline = (ranges.get(finding.path) ?? []).some(
      ({ first, last }) => finding.startLine >= first && finding.endLine <= last,
    );
    const severity = `**${label(finding.severity)}**`;
    const path = `\`${finding.path}:${finding.startLine}${finding.endLine > finding.startLine ? `-${finding.endLine}` : ""}\``;
    const detail = `${compact(finding.consequence)}${inline ? "" : ` Fix: ${compact(finding.correction)}`}`;
    rows.push(`- ${severity} ${path}: ${detail}`);
    if (inline)
      comments.push({
        path: finding.path,
        line: finding.endLine,
        side: "RIGHT",
        ...(finding.startLine === finding.endLine
          ? {}
          : { start_line: finding.startLine, start_side: "RIGHT" as const }),
        body: `${severity} · ${pass}\n\n${compact(finding.consequence)}\n\nFix: ${compact(finding.correction)}`,
      });
  }
  const coverage = contextComplete(job)
    ? ""
    : `\nINCOMPLETE: ${[...job.snapshot.omitted, ...(job.thread.length >= threadLimit ? ["thread truncated"] : [])].join(", ") || "changed-file context unavailable"}.`;
  const unverified = reviews.correctness.unverified + reviews.quality.unverified;
  const dropped =
    unverified === 0
      ? ""
      : `\nDropped ${unverified} finding${unverified === 1 ? "" : "s"} whose quoted evidence is not in the reviewed file.`;
  const body = `Correctness + quality · \`${job.snapshot.head}\`

${rows.join("\n") || "No findings in the supplied changed-file context."}${dropped}${coverage}`;
  if (body.length > 60000) throw new Error("Combined review exceeds GitHub body limit");
  return {
    event: "COMMENT",
    commit_id: job.snapshot.head,
    body,
    comments,
  };
}
