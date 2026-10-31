import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, matchesGlob, resolve } from "node:path";

/** An inclusive, 1-based range of lines that a pull request added or changed. */
export type LineRange = readonly [start: number, end: number];

/** The test files a package's Stryker command runs: Vitest include globs and CLI path filters. */
export type TestRun = { include: readonly string[]; filters: readonly string[] };

/**
 * What a pull request needs mutation tested in one Stryker package. `targets` lists Stryker
 * `--mutate` targets such as `src/schema/formats.ts:21-23`.
 */
export type MutationScope =
  | { kind: "skip" }
  | { kind: "all" }
  | { kind: "lines"; targets: string[] };

const setupFiles = ["stryker.config.json", "vite.config.ts", "package.json"];
const undetectedStatuses = new Set(["Survived", "NoCoverage"]);

/**
 * Reads the added and changed line ranges from the `git diff --unified=0` output of one file.
 * A file that only lost lines has no ranges.
 */
export function changedLines(diff: string): LineRange[] {
  return diff.split("\n").flatMap((line): LineRange[] => {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!hunk) return [];
    const start = Number(hunk[1]);
    const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
    return count > 0 ? [[start, start + count - 1]] : [];
  });
}

/** Reads the path filters from a Stryker command of the form `vp test <filters> <flags>`. */
export function testFilters(command: string): string[] {
  const [runner, subcommand, ...args] = command.trim().split(/\s+/);
  if (runner !== "vp" || subcommand !== "test")
    throw new Error(`Stryker must run "vp test <filters> <flags>", got "${command}"`);
  const firstFlag = args.findIndex((arg) => arg.startsWith("-"));
  return firstFlag === -1 ? args : args.slice(0, firstFlag);
}

/**
 * Mutates only the changed lines when every relevant change is to a mutated source file that
 * still exists. Any other change to the tests the Stryker command runs, their helpers, or the
 * test setup can weaken tests for every mutant, so it mutates the whole package. Test files the
 * command does not run are not relevant.
 */
export function mutationScope(input: {
  packageDir: string;
  mutate: readonly string[];
  tests: TestRun;
  changed: readonly string[];
  addedLines: (path: string) => readonly LineRange[];
  exists: (path: string) => boolean;
}): MutationScope {
  const prefix = `${input.packageDir}/`;
  const runsTest = (path: string) =>
    input.tests.filters.length === 0 || input.tests.filters.some((filter) => path.includes(filter));
  const isPackageCode = (path: string) =>
    ["src/**", "tests/**"].some((pattern) => matchesGlob(path, pattern));
  const isTestFile = (path: string) =>
    input.tests.include.some((pattern) => matchesGlob(path, pattern));
  const isTestInput = (path: string) =>
    setupFiles.includes(path) || (isPackageCode(path) && (!isTestFile(path) || runsTest(path)));
  const relevant = input.changed
    .filter((path) => path.startsWith(prefix))
    .map((path) => path.slice(prefix.length))
    .filter(isTestInput);
  if (relevant.length === 0) return { kind: "skip" };
  const included = input.mutate.filter((pattern) => !pattern.startsWith("!"));
  const excluded = input.mutate
    .filter((pattern) => pattern.startsWith("!"))
    .map((pattern) => pattern.slice(1));
  const mutated = (path: string) =>
    included.some((pattern) => matchesGlob(path, pattern)) &&
    !excluded.some((pattern) => matchesGlob(path, pattern)) &&
    input.exists(prefix + path);
  if (!relevant.every(mutated)) return { kind: "all" };
  const targets = relevant.flatMap((path) =>
    input.addedLines(prefix + path).map(([start, end]) => `${path}:${start}-${end}`),
  );
  return targets.length === 0 ? { kind: "skip" } : { kind: "lines", targets };
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`${label} must be an object`);
  return Object.fromEntries(Object.entries(value));
}

function strings(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string"))
    throw new Error(`${label} must be a list of strings`);
  return value;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  return value;
}

/** Lists the mutants a Stryker JSON report marks as survived or not covered. */
export function undetectedMutants(report: unknown): string[] {
  const files = record(record(report, "report").files, "report.files");
  return Object.entries(files).flatMap(([path, file]) => {
    const mutants = record(file, path).mutants;
    if (!Array.isArray(mutants)) throw new Error(`${path} mutants must be a list`);
    return mutants.flatMap((mutant: unknown) => {
      const fields = record(mutant, `${path} mutant`);
      if (!undetectedStatuses.has(text(fields.status, "mutant status"))) return [];
      const start = record(record(fields.location, "mutant location").start, "mutant start");
      const replacement = typeof fields.replacement === "string" ? ` ${fields.replacement}` : "";
      return [
        `${path}:${String(start.line)}:${String(start.column)} ${text(fields.mutatorName, "mutatorName")}${replacement}`,
      ];
    });
  });
}

function git(...args: string[]): string {
  const result = spawnSync("git", args, { encoding: "utf8", maxBuffer: Infinity });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed\n${result.stderr}`);
  return result.stdout;
}

async function testRun(packageDir: string, command: string): Promise<TestRun> {
  const config: unknown = (await import(resolve(packageDir, "vite.config.ts"))).default;
  const include = strings(
    record(record(config, "vite config").test, "vite config test").include,
    "test.include",
  );
  return { include, filters: testFilters(command) };
}

if (import.meta.main) {
  const [base, ...extra] = process.argv.slice(2).filter((arg) => arg !== "--");
  if (!base || extra.length > 0)
    throw new Error("Usage: vp run test:mutation:changed -- <base-revision>");
  const baseCommit = git("rev-parse", "--verify", "--end-of-options", `${base}^{commit}`).trim();
  const range = `${baseCommit}...HEAD`;
  const changed = git("diff", "--name-only", "-z", "--no-renames", range)
    .split("\0")
    .filter(Boolean);
  const addedLines = (path: string) =>
    changedLines(
      git(
        "--literal-pathspecs",
        "diff",
        "--unified=0",
        "--no-renames",
        "--no-color",
        "--no-ext-diff",
        range,
        "--",
        path,
      ),
    );
  const failed: string[] = [];
  for (const configPath of git("ls-files", "packages/*/stryker.config.json")
    .split("\n")
    .filter(Boolean)) {
    const packageDir = dirname(configPath);
    const config = record(JSON.parse(readFileSync(configPath, "utf8")), configPath);
    const scope = mutationScope({
      packageDir,
      mutate: strings(config.mutate, `${configPath} mutate`),
      tests: await testRun(
        packageDir,
        text(record(config.commandRunner, "commandRunner").command, "commandRunner.command"),
      ),
      changed,
      addedLines,
      exists: existsSync,
    });
    console.log(`${packageDir}: ${scope.kind === "lines" ? scope.targets.join(", ") : scope.kind}`);
    if (scope.kind === "skip") continue;
    const reportPath = join(
      packageDir,
      text(record(config.jsonReporter, "jsonReporter").fileName, "jsonReporter.fileName"),
    );
    rmSync(reportPath, { force: true });
    const args = scope.kind === "lines" ? ["--mutate", scope.targets.join(",")] : [];
    const stryker = spawnSync("vp", ["exec", "stryker", "run", ...args], {
      cwd: packageDir,
      stdio: "inherit",
    });
    const survivors =
      scope.kind === "lines" && (stryker.status === 0 || existsSync(reportPath))
        ? undetectedMutants(JSON.parse(readFileSync(reportPath, "utf8")))
        : [];
    if (survivors.length > 0)
      console.error(
        `${packageDir}: mutants survived in changed lines:\n${survivors.map((mutant) => `  ${packageDir}/${mutant}`).join("\n")}`,
      );
    if (stryker.status !== 0 || survivors.length > 0) failed.push(packageDir);
  }
  if (failed.length > 0) {
    console.error(`Mutation testing failed in ${failed.join(", ")}`);
    process.exit(1);
  }
}
