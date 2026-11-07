import { readFileSync } from "node:fs";
import { expect, test } from "vite-plus/test";
import { parse } from "yaml";

interface Step {
  id?: string;
  if?: string;
  run?: string;
  env?: Record<string, string>;
  "continue-on-error"?: unknown;
}

interface Job {
  name?: string;
  needs?: string | string[];
  if?: string;
  steps?: Step[];
  "continue-on-error"?: unknown;
}

const scriptReference = /\b(?:vp (?:-C (\S+) )?run|bun run) ([\w:][\w:-]*)/g;
const scripts: Readonly<Record<string, string>> = JSON.parse(
  readFileSync("package.json", "utf8"),
).scripts;
const jobs: Readonly<Record<string, Job>> = parse(
  readFileSync(".github/workflows/ci.yml", "utf8"),
).jobs;
const steps = Object.values(jobs).flatMap((job) => job.steps ?? []);
const commands = steps.flatMap((step) => step.run ?? []);
const ciScripts = new Set(commands.flatMap(scriptsRunBy));
const shardArgument = "--shard=${{ matrix.shard }}/${{ strategy.job-total }}";
const requiredCheck = "Lint, typecheck and test";
const reportOnlyJobs: ReadonlyMap<string, string> = new Map([
  [
    "browser-timings",
    "It only summarizes browser timings, so the required check does not wait for it.",
  ],
]);

function scriptsRunBy(text: string): string[] {
  return [...text.matchAll(scriptReference)].map(([, directory, name]) =>
    directory ? `${directory}#${name}` : `${name}`,
  );
}

function reachableFrom(script: string): Set<string> {
  const reached = new Set<string>();
  const pending = [script];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    if (reached.has(next)) continue;
    reached.add(next);
    pending.push(...scriptsRunBy(scripts[next] ?? ""));
  }
  return reached;
}

/** Scripts under `script` that CI runs neither directly nor through scripts that cover all of it. */
function notRunByCi(script: string): string[] {
  if (ciScripts.has(script)) return [];
  const body = scripts[script];
  const parts = body?.split("&&").map((part) => part.trim()) ?? [];
  if (!body || parts.some((part) => !/^(?:vp (?:-C \S+ )?run|bun run) [\w:]/.test(part)))
    return [script];
  return parts.flatMap(scriptsRunBy).flatMap(notRunByCi);
}

test("every package script that CI runs is part of vp run check", () => {
  expect(ciScripts.size).toBeGreaterThan(0);
  const checked = reachableFrom("check");
  expect([...ciScripts].filter((script) => !checked.has(script))).toEqual([]);
});

test("CI runs every package script that vp run check runs", () => {
  expect(notRunByCi("check")).toEqual([]);
});

test("CI runs package scripts in full, without narrowing arguments or ignored failures", () => {
  const narrowed = commands
    .filter((command) => scriptsRunBy(command).length > 0)
    .filter(
      (command) =>
        command
          .replace(scriptReference, "")
          .replaceAll(shardArgument, "")
          .replaceAll(" -- ", " ")
          .trim() !== "",
    );
  expect(narrowed).toEqual([]);
  expect(
    [...Object.values(jobs), ...steps].filter((entry) => "continue-on-error" in entry),
  ).toEqual([]);
  const conditionallySkipped = Object.values(jobs).flatMap((job) =>
    (job.steps ?? []).filter(
      (step, index, jobSteps) =>
        step.if !== undefined &&
        scriptsRunBy(step.run ?? "").length > 0 &&
        !jobSteps
          .slice(0, index)
          .some(
            (earlier) =>
              earlier.id !== undefined &&
              step.if === `\${{ !cancelled() && steps.${earlier.id}.outcome == 'success' }}`,
          ),
    ),
  );
  expect(conditionallySkipped).toEqual([]);
});

test("the required gate job needs every check job and fails unless all succeeded", () => {
  const gates = Object.entries(jobs).filter(([, job]) => job.name === requiredCheck);
  expect(gates.map(([id]) => id)).toHaveLength(1);
  const [gateId, gate] = gates[0] ?? [];
  expect(gate?.if).toBe("${{ always() }}");
  expect(gate?.steps?.map((step) => [step.env?.RESULTS, step.run])).toEqual([
    ["${{ toJSON(needs.*.result) }}", `jq --exit-status 'all(. == "success")' <<< "$RESULTS"`],
  ]);
  const needs = [gate?.needs ?? []].flat();
  const ungated = Object.keys(jobs).filter(
    (id) => id !== gateId && !reportOnlyJobs.has(id) && !needs.includes(id),
  );
  expect(ungated).toEqual([]);
  const reportScripts = [...reportOnlyJobs.keys()].flatMap((id) =>
    (jobs[id]?.steps ?? []).flatMap((step) => scriptsRunBy(step.run ?? "")),
  );
  expect(reportScripts).toEqual([]);
});
