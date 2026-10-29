import {
  prompt,
  requireObject,
  reviewSchema,
  validateReview,
  type Finding,
  type Job,
  type Review,
  type Snapshot,
} from "./index.ts";
import { runModel } from "../ai-models/index.ts";

export type ReviewPasses = { correctness: Review; quality: Review };
type Pass = keyof ReviewPasses;
type CombinedFinding = { finding: Finding; passes: Pass[] };
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

export function validateReviewPasses(value: unknown, snapshot: Snapshot): ReviewPasses {
  const result = requireObject(value);
  return {
    correctness: validateReview(result.correctness, snapshot),
    quality: validateReview(result.quality, snapshot),
  };
}

export async function runReviewPasses(
  job: Job,
  guidance: string,
  runner: typeof runModel = runModel,
): Promise<ReviewPasses> {
  const concise =
    "Write for rapid reading. Use one short sentence for the summary, consequence, and correction. Omit praise, repeated evidence, and general advice.";
  const [correctness, quality] = await Promise.all(
    (["codexReviewer", "claudeReviewer"] as const).map(async (role) =>
      validateReview(
        await runner(
          job.selection,
          `${prompt({ ...job, task: "review", role }, guidance)}\n${concise}`,
          reviewSchema,
        ),
        job.snapshot,
      ),
    ),
  );
  return { correctness: correctness!, quality: quality! };
}

function findings(reviews: ReviewPasses): CombinedFinding[] {
  const result = new Map<string, CombinedFinding>();
  for (const pass of ["correctness", "quality"] as const) {
    for (const finding of reviews[pass].findings) {
      const key = JSON.stringify([
        finding.path,
        finding.startLine,
        finding.endLine,
        compact(finding.consequence).toLowerCase(),
        compact(finding.correction).toLowerCase(),
      ]);
      const prior = result.get(key);
      if (prior) {
        if (!prior.passes.includes(pass)) prior.passes.push(pass);
        if (rank[finding.severity] < rank[prior.finding.severity]) prior.finding = finding;
      } else result.set(key, { finding, passes: [pass] });
    }
  }
  return [...result.values()].sort((a, b) => rank[a.finding.severity] - rank[b.finding.severity]);
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
  for (const { finding, passes } of findings(reviews)) {
    const file = job.snapshot.files.find((candidate) => candidate.path === finding.path);
    let ranges: { first: number; last: number }[] = [];
    if (file?.patch) {
      try {
        ranges = parsePatch(file.patch).flatMap((patch) =>
          patch.hunks.map((hunk) => ({
            first: hunk.newStart,
            last: hunk.newStart + hunk.newLines - 1,
          })),
        );
      } catch {
        ranges = [];
      }
    }
    const inline = ranges.some(
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
        body: `${severity} · ${passes.join(" + ")}\n\n${compact(finding.consequence)}\n\nFix: ${compact(finding.correction)}`,
      });
  }
  const incomplete = !job.snapshot.complete || job.thread.length >= 24000;
  const coverage = incomplete
    ? `\nINCOMPLETE: ${[...job.snapshot.omitted, ...(job.thread.length >= 24000 ? ["thread truncated"] : [])].join(", ") || "changed-file context unavailable"}.`
    : "";
  const body = `Correctness + quality · \`${job.snapshot.head}\`

${rows.join("\n") || "No findings in the supplied changed-file context."}${coverage}`;
  if (body.length > 60000) throw new Error("Combined review exceeds GitHub body limit");
  return {
    event: "COMMENT",
    commit_id: job.snapshot.head,
    body,
    comments,
  };
}
