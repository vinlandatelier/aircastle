import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, matchesGlob } from "node:path";

/** What a pull request needs mutation tested in one Stryker package. */
export type MutationScope = { kind: "skip" } | { kind: "all" } | { kind: "files"; files: string[] };

const testInputs = ["src/**", "tests/**", "stryker.config.json", "vite.config.ts", "package.json"];

/**
 * Mutates only the changed files when every relevant change is a mutated source file that still
 * exists. Any other change to the package's tests or test setup can weaken tests for every
 * mutant, so it mutates the whole package.
 */
export function mutationScope(input: {
  packageDir: string;
  mutate: readonly string[];
  changed: readonly string[];
  exists: (path: string) => boolean;
}): MutationScope {
  const prefix = `${input.packageDir}/`;
  const relevant = input.changed
    .filter((path) => path.startsWith(prefix))
    .map((path) => path.slice(prefix.length))
    .filter((path) => testInputs.some((pattern) => matchesGlob(path, pattern)));
  if (relevant.length === 0) return { kind: "skip" };
  const included = input.mutate.filter((pattern) => !pattern.startsWith("!"));
  const excluded = input.mutate
    .filter((pattern) => pattern.startsWith("!"))
    .map((pattern) => pattern.slice(1));
  const mutated = (path: string) =>
    included.some((pattern) => matchesGlob(path, pattern)) &&
    !excluded.some((pattern) => matchesGlob(path, pattern)) &&
    input.exists(prefix + path);
  return relevant.every(mutated) ? { kind: "files", files: relevant } : { kind: "all" };
}

function git(...args: string[]): string[] {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed\n${result.stderr}`);
  return result.stdout.split("\n").filter(Boolean);
}

function mutatePatterns(configPath: string): string[] {
  const config: unknown = JSON.parse(readFileSync(configPath, "utf8"));
  const mutate =
    typeof config === "object" && config !== null && "mutate" in config ? config.mutate : undefined;
  if (!Array.isArray(mutate) || !mutate.every((pattern) => typeof pattern === "string"))
    throw new Error(`${configPath} must list its mutate globs`);
  return mutate;
}

if (import.meta.main) {
  const [base, ...extra] = process.argv.slice(2).filter((arg) => arg !== "--");
  if (!base || extra.length > 0)
    throw new Error("Usage: vp run test:mutation:changed -- <base-revision>");
  const [baseCommit] = git("rev-parse", "--verify", "--end-of-options", `${base}^{commit}`);
  const changed = git("diff", "--name-only", "--no-renames", `${baseCommit}...HEAD`);
  const failed: string[] = [];
  for (const config of git("ls-files", "packages/*/stryker.config.json")) {
    const packageDir = dirname(config);
    const scope = mutationScope({
      packageDir,
      mutate: mutatePatterns(config),
      changed,
      exists: existsSync,
    });
    console.log(`${packageDir}: ${scope.kind === "files" ? scope.files.join(", ") : scope.kind}`);
    if (scope.kind === "skip") continue;
    const args = scope.kind === "files" ? ["--mutate", scope.files.join(",")] : [];
    const stryker = spawnSync("vp", ["exec", "stryker", "run", ...args], {
      cwd: packageDir,
      stdio: "inherit",
    });
    if (stryker.status !== 0) failed.push(packageDir);
  }
  if (failed.length > 0) {
    console.error(`Mutation testing failed in ${failed.join(", ")}`);
    process.exit(1);
  }
}
