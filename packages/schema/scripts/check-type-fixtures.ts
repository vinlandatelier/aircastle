import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { rejectionCases, type RejectionCase } from "../tests/types/rejections.ts";

const root = resolve(import.meta.dir, "..");

export function assertExpectedDiagnostic(
  output: string,
  source: string,
  fixture: RejectionCase,
): void {
  const diagnostics = [...output.matchAll(/^(.+)\((\d+),(\d+)\): error TS(\d+):/gm)];
  const headers = [...output.matchAll(/\berror TS\d+:/g)];
  if (diagnostics.length !== 1 || headers.length !== 1) {
    throw new Error(
      `${fixture.file}: expected exactly one located compiler error, received ${headers.length}\n${output}`,
    );
  }
  const diagnostic = diagnostics[0]!;
  const [, file, line, column, code] = diagnostic;
  if (
    resolve(root, file!) !== resolve(root, fixture.file) ||
    !fixture.codes.includes(Number(code))
  ) {
    throw new Error(`${fixture.file}: unexpected diagnostic location or code\n${output}`);
  }
  const targetStart = source.indexOf(fixture.target);
  if (targetStart < 0 || source.indexOf(fixture.target, targetStart + 1) >= 0) {
    throw new Error(`${fixture.file}: diagnostic target must occur exactly once`);
  }
  const lines = source.split("\n");
  const lineIndex = Number(line) - 1;
  const columnIndex = Number(column) - 1;
  if (
    lineIndex < 0 ||
    lineIndex >= lines.length ||
    columnIndex < 0 ||
    columnIndex >= lines[lineIndex]!.length
  ) {
    throw new Error(`${fixture.file}: diagnostic position is outside the source`);
  }
  const offset =
    lines.slice(0, lineIndex).reduce((sum, text) => sum + text.length + 1, 0) + columnIndex;
  if (offset < targetStart || offset >= targetStart + fixture.target.length) {
    throw new Error(
      `${fixture.file}: compiler error is outside the intended expression\n${output}`,
    );
  }
}

function compile(
  config: string,
  options: readonly string[] = [],
): { exitCode: number; output: string } {
  const result = Bun.spawnSync(
    [
      process.execPath,
      join(dirname(Bun.resolveSync("typescript/package.json", root)), "bin/tsc"),
      "-p",
      config,
      "--pretty",
      "false",
      ...options,
    ],
    {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  if (result.signalCode) throw new Error(`Compiler terminated with ${result.signalCode}`);
  return {
    exitCode: result.exitCode,
    output: new TextDecoder().decode(result.stdout) + new TextDecoder().decode(result.stderr),
  };
}

export function assertDeclarationGraph(
  output: string,
  artifact: string,
  sourceDirectory: string,
  requireEntry = true,
): void {
  const files = output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((file) => resolve(root, file));
  if (requireEntry && !files.includes(resolve(artifact)))
    throw new Error("Consumer did not load the emitted entry point");
  if (files.some((file) => file.startsWith(resolve(sourceDirectory) + sep)))
    throw new Error("Declaration consumer fell back to source");
}

export function runTypeFixtures(
  suite: "contracts" | "inference",
  target: "source" | "declarations" = "source",
): void {
  let config = resolve(
    root,
    suite === "contracts" ? "tsconfig.tests.json" : "tsconfig.inference.json",
  );
  const directory = mkdtempSync(join(root, ".type-fixtures-"));
  let emittedEntry: string | undefined;
  let passed = 0;
  try {
    if (target === "declarations") {
      const artifactDirectory = join(directory, "artifacts");
      const build = compile(resolve(root, "tsconfig.json"), [
        "--noEmit",
        "false",
        "--declaration",
        "--emitDeclarationOnly",
        "--outDir",
        artifactDirectory,
      ]);
      if (build.exitCode !== 0) throw new Error(`Declaration build failed\n${build.output}`);
      const entry = join(artifactDirectory, "index.d.ts");
      emittedEntry = entry;
      const consumerConfig = join(directory, "consumer.json");
      writeFileSync(
        consumerConfig,
        JSON.stringify({
          extends: config,
          compilerOptions: {
            types: [],
            skipLibCheck: false,
            paths: { "aircastle-under-test": [entry] },
          },
          files: [
            resolve(root, `tests/types/${suite === "contracts" ? "contracts" : "inference"}.ts`),
          ],
          include: [],
          exclude: [],
        }),
      );
      config = consumerConfig;
      const graph = compile(config, ["--listFilesOnly"]);
      if (graph.exitCode !== 0)
        throw new Error(`Declaration consumer graph failed\n${graph.output}`);
      assertDeclarationGraph(graph.output, entry, join(root, "src"));
    }
    const baseline = compile(config);
    if (baseline.exitCode !== 0)
      throw new Error(
        `Positive ${suite} ${target} baseline failed. No negative fixture receives credit.\n${baseline.output}`,
      );
    for (const fixture of rejectionCases.filter((entry) => entry.suite === suite)) {
      const temporaryConfig = join(directory, "tsconfig.json");
      writeFileSync(
        temporaryConfig,
        JSON.stringify({
          extends: config,
          files: [resolve(root, fixture.file)],
          include: [],
          exclude: [],
        }),
      );
      const result = compile(temporaryConfig, emittedEntry ? ["--listFiles"] : []);
      if (result.exitCode === 0)
        throw new Error(`${fixture.file}: invalid program unexpectedly compiled`);
      if (emittedEntry)
        assertDeclarationGraph(
          result.output,
          emittedEntry,
          join(root, "src"),
          fixture.requiresApi !== false,
        );
      assertExpectedDiagnostic(
        result.output,
        readFileSync(resolve(root, fixture.file), "utf8"),
        fixture,
      );
      passed++;
      console.log(`PASS ${target} ${fixture.file}`);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  if (passed === 0) throw new Error(`No ${suite} negative fixtures were discovered`);
  console.log(
    `${passed} ${suite} ${target} negative fixtures rejected at their intended expressions`,
  );
}

if (import.meta.main) {
  const suite = process.argv[2];
  const target = process.argv[3] ?? "source";
  if (suite !== "contracts" && suite !== "inference")
    throw new Error("Choose contracts or inference");
  if (target !== "source" && target !== "declarations")
    throw new Error("Choose source or declarations");
  runTypeFixtures(suite, target);
}
