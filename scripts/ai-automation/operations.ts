import { runModel } from "../ai-models/index.ts";
import {
  digest,
  fixSchema,
  prompt,
  requireObject,
  validateEdits,
  type Job,
  type ModelOutput,
} from "./index.ts";
import { interpretRequest } from "./commands.ts";
import { runReviewPasses, validateReviewPasses } from "./reviews.ts";

export function boundModelOutput(job: Job, value: unknown): ModelOutput {
  const output = requireObject(value);
  if (
    output.id !== job.id ||
    output.digest !== digest(job) ||
    (output.task !== "review" && output.task !== "fix") ||
    (job.task !== "request" && output.task !== job.task)
  )
    throw new Error("Model result input binding mismatch");
  const selection =
    job.task === "request" && output.task === "fix" ? job.implementation : job.selection;
  if (digest(output.selection) !== digest(selection)) throw new Error("Model selection mismatch");
  if (output.task === "fix" && (!job.snapshot.complete || job.thread.length >= 24000))
    throw new Error("Fix requires complete bounded changed-file context");
  return {
    id: job.id,
    digest: digest(job),
    task: output.task,
    selection,
    result:
      output.task === "review"
        ? validateReviewPasses(output.result, job.snapshot)
        : validateEdits(output.result, job.snapshot),
  };
}

export async function executeOperation(
  job: Job,
  guidance: string,
  runner: typeof runModel = runModel,
): Promise<ModelOutput> {
  const task =
    job.task === "request"
      ? await interpretRequest(job.instructions, job.selection, runner)
      : job.task;
  const selection = job.task === "request" && task === "fix" ? job.implementation : job.selection;
  if (task === "fix" && (!job.snapshot.complete || job.thread.length >= 24000))
    throw new Error("Fix requires complete bounded changed-file context");
  const result =
    task === "review"
      ? await runReviewPasses(job, guidance, runner)
      : validateEdits(
          await runner(
            selection,
            prompt(
              {
                ...job,
                task: "fix",
                role: job.task === "request" ? "claudeImplementer" : job.role,
                selection,
              },
              guidance,
            ),
            fixSchema,
          ),
          job.snapshot,
        );
  return { id: job.id, digest: digest(job), task, selection, result };
}
