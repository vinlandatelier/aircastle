import { readFileSync } from "node:fs";
import { expect, test } from "vite-plus/test";
import { parse } from "yaml";

const scripts: Readonly<Record<string, string>> = JSON.parse(
  readFileSync("package.json", "utf8"),
).scripts;
const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
const ciScripts = new Set(scriptsRunBy(workflow));
const requiredCheck = "Lint, typecheck and test";
const reportOnlyJobs: ReadonlyMap<string, string> = new Map([
  [
    "browser-timings",
    "It only summarizes browser timings, so the required check does not wait for it.",
  ],
]);

function scriptsRunBy(text: string): string[] {
  return [...text.matchAll(/\b(?:vp (?:-C (\S+) )?run|bun run) ([\w:][\w:-]*)/g)].map(
    ([, directory, name]) => (directory ? `${directory}#${name}` : `${name}`),
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
  const steps = body?.split("&&").map((step) => step.trim()) ?? [];
  if (!body || steps.some((step) => !/^(?:vp (?:-C \S+ )?run|bun run) [\w:]/.test(step)))
    return [script];
  return steps.flatMap(scriptsRunBy).flatMap(notRunByCi);
}

test("every package script that CI runs is part of vp run check", () => {
  expect(ciScripts.size).toBeGreaterThan(0);
  const checked = reachableFrom("check");
  expect([...ciScripts].filter((script) => !checked.has(script))).toEqual([]);
});

test("CI runs every package script that vp run check runs", () => {
  expect(notRunByCi("check")).toEqual([]);
});

test("the required gate job needs every check job and runs even when one fails", () => {
  const jobs: Record<string, { name?: string; needs?: string[]; if?: string }> =
    parse(workflow).jobs;
  const gates = Object.entries(jobs).filter(([, job]) => job.name === requiredCheck);
  expect(gates.map(([id]) => id)).toHaveLength(1);
  const [gateId, gate] = gates[0] ?? [];
  expect(gate?.if).toBe("${{ always() }}");
  const ungated = Object.keys(jobs).filter(
    (id) => id !== gateId && !reportOnlyJobs.has(id) && !gate?.needs?.includes(id),
  );
  expect(ungated).toEqual([]);
});
