import { expect, test } from "vite-plus/test";
import {
  changedLines,
  mutationScope,
  testFilters,
  undetectedMutants,
} from "../../scripts/mutate-changed.ts";

const schema = {
  packageDir: "packages/schema",
  mutate: ["src/schema/**/*.ts", "!src/schema/contract.ts"],
  tests: { include: ["tests/**/*.test.ts"], filters: ["tests/schema"] },
  addedLines: (path: string) =>
    ({
      "packages/schema/src/schema/compile.ts": [[83, 83] as const],
      "packages/schema/src/schema/formats.ts": [[3, 4] as const, [23, 23] as const],
    })[path] ?? [],
  exists: () => true,
};

test("changes outside the tests and setup the Stryker command runs skip mutation testing", () => {
  for (const changed of [
    [],
    ["apps/web/src/main.tsx", "packages/contracts/src/index.ts"],
    ["packages/schema-extra/src/schema/compile.ts"],
    ["packages/schema/scripts/classify-mutations.ts"],
    ["packages/schema/tests/harness/mutation-report.test.ts"],
  ]) {
    expect(mutationScope({ ...schema, changed }), changed.join()).toEqual({ kind: "skip" });
  }
});

test("changes limited to mutated source files mutate only their changed lines", () => {
  expect(
    mutationScope({
      ...schema,
      changed: [
        "packages/schema/src/schema/compile.ts",
        "apps/web/src/main.tsx",
        "packages/schema/src/schema/formats.ts",
      ],
    }),
  ).toEqual({
    kind: "lines",
    targets: [
      "src/schema/compile.ts:83-83",
      "src/schema/formats.ts:3-4",
      "src/schema/formats.ts:23-23",
    ],
  });
});

test("source changes that only delete lines have nothing to mutate", () => {
  expect(
    mutationScope({
      ...schema,
      changed: ["packages/schema/src/schema/values.ts"],
      addedLines: () => [],
    }),
  ).toEqual({ kind: "skip" });
});

test("changes to run tests, their helpers, setup or unmutated sources mutate the whole package", () => {
  for (const file of [
    "tests/schema/compile.test.ts",
    "tests/support/assertions.ts",
    "tests/fixtures/unicode/15.1.0/GraphemeBreakTest.txt",
    "stryker.config.json",
    "vite.config.ts",
    "package.json",
    "src/index.ts",
    "src/schema/contract.ts",
  ]) {
    expect(
      mutationScope({
        ...schema,
        changed: ["packages/schema/src/schema/compile.ts", `packages/schema/${file}`],
      }),
      file,
    ).toEqual({ kind: "all" });
  }
});

test("a command without path filters runs every included test file", () => {
  expect(
    mutationScope({
      ...schema,
      tests: { include: ["tests/**/*.test.ts"], filters: [] },
      changed: ["packages/schema/tests/harness/mutation-report.test.ts"],
    }),
  ).toEqual({ kind: "all" });
});

test("deleting a mutated source file mutates the whole package", () => {
  expect(
    mutationScope({
      ...schema,
      changed: ["packages/schema/src/schema/formats.ts"],
      exists: (path) => path !== "packages/schema/src/schema/formats.ts",
    }),
  ).toEqual({ kind: "all" });
});

test("changed lines come from the new side of each zero-context hunk of one file", () => {
  const diff = [
    "diff --git a/src/a.ts b/src/a.ts",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -3 +3 @@ export function a() {",
    "-++ old",
    "+++ new",
    "@@ -10,0 +11,2 @@",
    "+@@ -1 +1 @@",
    "+",
    "@@ -20,4 +22,0 @@",
  ].join("\n");
  expect(changedLines(diff)).toEqual([
    [3, 3],
    [11, 12],
  ]);
  expect(changedLines("")).toEqual([]);
});

test("test filters are the paths before the first flag of a vp test command", () => {
  expect(testFilters("vp test tests/schema --bail 1 --maxWorkers 1")).toEqual(["tests/schema"]);
  expect(testFilters("vp test src")).toEqual(["src"]);
  expect(testFilters("vp test --bail 1")).toEqual([]);
  expect(() => testFilters("bun run test:schema --bail 1")).toThrow(/vp test/);
});

test("undetected mutants are the survived and uncovered ones with their location", () => {
  const mutant = (status: string, line: number, replacement?: string) => ({
    status,
    mutatorName: "ConditionalExpression",
    location: { start: { line, column: 6 }, end: { line, column: 9 } },
    ...(replacement === undefined ? {} : { replacement }),
  });
  expect(
    undetectedMutants({
      files: {
        "src/schema/formats.ts": {
          mutants: [
            mutant("Killed", 1, "true"),
            mutant("Survived", 2, "true"),
            mutant("Timeout", 3),
            mutant("NoCoverage", 4),
            mutant("CompileError", 5),
          ],
        },
      },
    }),
  ).toEqual([
    "src/schema/formats.ts:2:6 ConditionalExpression true",
    "src/schema/formats.ts:4:6 ConditionalExpression",
  ]);
  expect(() => undetectedMutants({ files: { "a.ts": { mutants: {} } } })).toThrow(/mutants/);
});
