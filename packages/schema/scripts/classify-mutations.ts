import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

interface Mutant {
  id: string;
  replacement: string;
  location: { start: { line: number; column: number }; end: { line: number; column: number } };
  status: string;
  statusReason?: string;
}
interface MutationFile {
  source: string;
  mutants: Mutant[];
}
interface ClassifiedMutant {
  file: string;
  id: string;
  runtimeStatus: string;
  validity: "valid" | "compile-error" | "checker-error";
  diagnostic?: string;
}
const defaultRoot = resolve(import.meta.dirname, "..");

export function applyMutation(
  source: string,
  mutant: Pick<Mutant, "location" | "replacement">,
): string {
  const lines = source.split("\n");
  const offset = ({ line, column }: { line: number; column: number }) => {
    if (
      !Number.isInteger(line) ||
      !Number.isInteger(column) ||
      line < 1 ||
      line > lines.length ||
      column < 1 ||
      column > lines[line - 1]!.length + 1
    )
      throw new Error("Mutation position is outside the source");
    return lines.slice(0, line - 1).reduce((sum, value) => sum + value.length + 1, 0) + column - 1;
  };
  const start = offset(mutant.location.start);
  const end = offset(mutant.location.end);
  if (end < start) throw new Error("Mutation range is reversed");
  return source.slice(0, start) + mutant.replacement + source.slice(end);
}

async function compile(
  directory: string,
  root: string,
): Promise<{ exitCode: number; output: string }> {
  const child = Bun.spawn(
    [
      process.execPath,
      join(dirname(Bun.resolveSync("typescript/package.json", root)), "bin/tsc"),
      "-p",
      join(directory, "tsconfig.json"),
      "--pretty",
      "false",
    ],
    { cwd: directory, stdout: "pipe", stderr: "pipe" },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exitCode, output: stdout + stderr };
}

export async function classifyMutations(
  reportPath: string,
  root = defaultRoot,
  sourceSubdirectory = "src/schema",
): Promise<void> {
  const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
    files: Record<string, MutationFile>;
  };
  const tasks: { file: string; source: string; mutant: Mutant }[] = [];
  for (const [file, data] of Object.entries(report.files)) {
    if (!resolve(root, file).startsWith(resolve(root, sourceSubdirectory) + sep))
      throw new Error(`Unexpected mutation file: ${file}`);
    if (readFileSync(resolve(root, file), "utf8") !== data.source)
      throw new Error(`Source changed since mutation run: ${file}`);
    for (const mutant of data.mutants) tasks.push({ file, source: data.source, mutant });
  }
  if (!tasks.length) throw new Error("Mutation report contains no mutants");
  const results: ClassifiedMutant[] = [];
  let next = 0;
  const logs = join(dirname(reportPath), "type-errors");
  mkdirSync(logs, { recursive: true });
  await Promise.all(
    Array.from({ length: Math.min(4, tasks.length) }, async () => {
      const directory = mkdtempSync(join(root, ".mutation-types-"));
      try {
        cpSync(join(root, "src"), join(directory, "src"), { recursive: true });
        writeFileSync(
          join(directory, "tsconfig.json"),
          JSON.stringify({
            extends: join(root, "tsconfig.json"),
            compilerOptions: { rootDir: "./src" },
            include: ["src/**/*.ts"],
          }),
        );
        const baseline = await compile(directory, root);
        if (baseline.exitCode !== 0)
          throw new Error(`Mutation compiler baseline failed\n${baseline.output}`);
        while (next < tasks.length) {
          const { file, source, mutant } = tasks[next++]!;
          const path = join(directory, file);
          writeFileSync(path, applyMutation(source, mutant));
          let checked: { exitCode: number; output: string };
          try {
            checked = await compile(directory, root);
          } finally {
            writeFileSync(path, source);
          }
          const validity =
            checked.exitCode === 0
              ? "valid"
              : /\berror TS\d+:/.test(checked.output)
                ? "compile-error"
                : "checker-error";
          const result: ClassifiedMutant = {
            file,
            id: mutant.id,
            runtimeStatus: mutant.status,
            validity,
          };
          if (validity !== "valid") {
            const log = join(logs, `${mutant.id}.log`);
            writeFileSync(log, checked.output);
            result.diagnostic = log;
          }
          results.push(result);
        }
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    }),
  );
  results.sort((left, right) => Number(left.id) - Number(right.id));
  const count = (predicate: (result: ClassifiedMutant) => boolean) =>
    results.filter(predicate).length;
  const summary = {
    total: results.length,
    compileErrors: count((result) => result.validity === "compile-error"),
    checkerErrors: count((result) => result.validity === "checker-error"),
    validKilled: count(
      (result) => result.validity === "valid" && result.runtimeStatus === "Killed",
    ),
    validSurvived: count(
      (result) => result.validity === "valid" && result.runtimeStatus === "Survived",
    ),
    validTimeouts: count(
      (result) => result.validity === "valid" && result.runtimeStatus === "Timeout",
    ),
    validOther: count(
      (result) =>
        result.validity === "valid" &&
        !["Killed", "Survived", "Timeout"].includes(result.runtimeStatus),
    ),
  };
  writeFileSync(
    join(dirname(reportPath), "classification.json"),
    JSON.stringify(
      {
        report: reportPath,
        compiler: JSON.parse(readFileSync(Bun.resolveSync("typescript/package.json", root), "utf8"))
          .version,
        summary,
        mutants: results,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify(
      {
        ...summary,
        reportSHA256: createHash("sha256").update(readFileSync(reportPath)).digest("hex"),
      },
      null,
      2,
    ),
  );
  if (summary.checkerErrors)
    throw new Error("Some mutation validity checks failed without compiler diagnostics");
}

if (import.meta.main) {
  const root = resolve(process.argv[3] ?? defaultRoot);
  await classifyMutations(
    resolve(root, process.argv[2] ?? "reports/mutation/mutation.json"),
    root,
    process.argv[4] ?? "src/schema",
  );
}
