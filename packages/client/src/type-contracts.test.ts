import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";

interface Rejection {
  file: string;
  target: string;
  codes: number[];
}

const root = fileURLToPath(new URL("../", import.meta.url));
const compiler = resolve(dirname(fileURLToPath(import.meta.resolve("typescript"))), "../bin/tsc");
const cases: Rejection[] = JSON.parse(
  readFileSync(join(root, "tests/types/negative.json"), "utf8"),
);
const directory = mkdtempSync(join(root, ".type-fixtures-"));
const sourceConfig = join(root, "tsconfig.types.json");
const artifacts = join(directory, "artifacts");
const emittedEntry = join(artifacts, "index.d.ts");

function compile(config: string, args: string[] = []) {
  try {
    return {
      status: 0,
      output: execFileSync(
        process.execPath,
        [compiler, "-p", config, "--pretty", "false", ...args],
        { cwd: root, encoding: "utf8", timeout: 30_000, stdio: "pipe" },
      ),
    };
  } catch (error) {
    if (
      error === null ||
      typeof error !== "object" ||
      !("status" in error) ||
      !("stdout" in error) ||
      !("stderr" in error)
    )
      throw error;
    if (typeof error.status !== "number") throw error;
    return { status: error.status, output: String(error.stdout) + String(error.stderr) };
  }
}

function configFor(target: "source" | "declarations", file: string) {
  const config = join(directory, `${target}-${relative(root, file).replaceAll("/", "-")}.json`);
  writeFileSync(
    config,
    JSON.stringify({
      extends: sourceConfig,
      compilerOptions: {
        customConditions: target === "declarations" ? [] : ["development"],
        paths: {
          "aircastle-client-under-test": [
            target === "source" ? join(root, "src/index.ts") : emittedEntry,
          ],
        },
      },
      files: [file],
      include: [],
      exclude: [],
    }),
  );
  return config;
}

function assertDiagnostic(output: string, fixture: Rejection, file: string) {
  const diagnostics = [...output.matchAll(/^(.+)\((\d+),(\d+)\): error TS(\d+):/gm)];
  expect(diagnostics, output).toHaveLength(1);
  expect([...output.matchAll(/\berror TS\d+:/g)], output).toHaveLength(1);
  const diagnostic = diagnostics[0]!;
  expect(resolve(root, diagnostic[1]!), output).toBe(file);
  expect(fixture.codes, output).toContain(Number(diagnostic[4]));
  const source = readFileSync(file, "utf8");
  const start = source.indexOf(fixture.target);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(source.indexOf(fixture.target, start + 1)).toBe(-1);
  const line = Number(diagnostic[2]) - 1;
  const offset =
    source
      .split("\n")
      .slice(0, line)
      .reduce((sum, entry) => sum + entry.length + 1, 0) +
    Number(diagnostic[3]) -
    1;
  expect(offset, output).toBeGreaterThanOrEqual(start);
  expect(offset, output).toBeLessThan(start + fixture.target.length);
}

beforeAll(() => {
  const buildConfig = join(directory, "build.json");
  writeFileSync(
    buildConfig,
    JSON.stringify({
      extends: join(root, "tsconfig.json"),
      compilerOptions: {
        noEmit: false,
        declaration: true,
        emitDeclarationOnly: true,
        outDir: artifacts,
      },
      files: [join(root, "src/index.ts")],
      include: [],
      exclude: [],
    }),
  );
  const result = compile(buildConfig);
  expect(result.status, result.output).toBe(0);
}, 30_000);

afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe.each(["source", "declarations"] as const)("%s client type contract", (target) => {
  test("the positive consumer retains collection, presence, default and discriminated-result types", () => {
    const config = configFor(target, join(root, "tests/types/positive.ts"));
    const result = compile(config);
    expect(result.status, result.output).toBe(0);
    if (target === "declarations") {
      const graph = compile(config, ["--listFilesOnly"]);
      expect(graph.status, graph.output).toBe(0);
      const files = graph.output
        .split(/\r?\n/)
        .filter(Boolean)
        .map((file) => resolve(root, file));
      expect(files).toContain(emittedEntry);
      for (const name of ["client", "contracts", "core", "adapter-postgres", "cli", "schema"]) {
        const source = join(resolve(root, "../.."), "packages", name, "src") + sep;
        expect(files.some((file) => file.startsWith(source))).toBe(false);
      }
    }
  }, 30_000);

  test.each(cases)(
    "rejects $file at its intended expression",
    (fixture) => {
      const file = join(root, "tests/types/negative", fixture.file);
      const result = compile(configFor(target, file));
      expect(result.status, result.output).not.toBe(0);
      assertDiagnostic(result.output, fixture, file);
    },
    30_000,
  );
});
