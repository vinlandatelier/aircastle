import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { rejectionCases, type RejectionCase } from "../tests/types/rejections.ts";

const root = resolve(import.meta.dir, "..");

export function assertExpectedDiagnostic(output: string, source: string, fixture: RejectionCase): void {
  const diagnostics = [...output.matchAll(/^(.+)\((\d+),(\d+)\): error TS(\d+):/gm)];
  const headers = [...output.matchAll(/\berror TS\d+:/g)];
  if (diagnostics.length !== 1 || headers.length !== 1) {
    throw new Error(`${fixture.file}: expected exactly one located compiler error, received ${headers.length}\n${output}`);
  }
  const diagnostic = diagnostics[0]!;
  const [, file, line, column, code] = diagnostic;
  if (resolve(root, file!) !== resolve(root, fixture.file) || !fixture.codes.includes(Number(code))) {
    throw new Error(`${fixture.file}: unexpected diagnostic location or code\n${output}`);
  }
  const targetStart = source.indexOf(fixture.target);
  if (targetStart < 0 || source.indexOf(fixture.target, targetStart + 1) >= 0) {
    throw new Error(`${fixture.file}: diagnostic target must occur exactly once`);
  }
  const lines = source.split("\n");
  const lineIndex = Number(line) - 1;
  const columnIndex = Number(column) - 1;
  if (lineIndex < 0 || lineIndex >= lines.length || columnIndex < 0 || columnIndex >= lines[lineIndex]!.length) {
    throw new Error(`${fixture.file}: diagnostic position is outside the source`);
  }
  const offset = lines.slice(0, lineIndex).reduce((sum, text) => sum + text.length + 1, 0) + columnIndex;
  if (offset < targetStart || offset >= targetStart + fixture.target.length) {
    throw new Error(`${fixture.file}: compiler error is outside the intended expression\n${output}`);
  }
}

function compile(config: string): { exitCode: number; output: string } {
  const result = Bun.spawnSync([process.execPath, join(root, "node_modules/typescript/bin/tsc"), "-p", config, "--pretty", "false"], {
    cwd: root, stdout: "pipe", stderr: "pipe",
  });
  if (result.signalCode) throw new Error(`Compiler terminated with ${result.signalCode}`);
  return { exitCode: result.exitCode, output: new TextDecoder().decode(result.stdout) + new TextDecoder().decode(result.stderr) };
}

export function runTypeFixtures(suite: "contracts" | "inference"): void {
  const config = resolve(root, suite === "contracts" ? "tsconfig.tests.json" : "tsconfig.inference.json");
  const baseline = compile(config);
  if (baseline.exitCode !== 0) throw new Error(`Positive ${suite} baseline failed. No negative fixture receives credit.\n${baseline.output}`);
  const directory = mkdtempSync(join(root, ".type-fixtures-"));
  let passed = 0;
  try {
    for (const fixture of rejectionCases.filter((entry) => entry.suite === suite)) {
      const temporaryConfig = join(directory, "tsconfig.json");
      writeFileSync(temporaryConfig, JSON.stringify({ extends: config, files: [resolve(root, fixture.file)], include: [], exclude: [] }));
      const result = compile(temporaryConfig);
      if (result.exitCode === 0) throw new Error(`${fixture.file}: invalid program unexpectedly compiled`);
      assertExpectedDiagnostic(result.output, readFileSync(resolve(root, fixture.file), "utf8"), fixture);
      passed++;
      console.log(`PASS ${fixture.file}`);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
  if (passed === 0) throw new Error(`No ${suite} negative fixtures were discovered`);
  console.log(`${passed} ${suite} negative fixtures rejected at their intended expressions`);
}

if (import.meta.main) {
  const suite = process.argv[2];
  if (suite !== "contracts" && suite !== "inference") throw new Error("Choose contracts or inference");
  runTypeFixtures(suite);
}
