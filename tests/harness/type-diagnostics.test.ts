import { expect, test } from "bun:test";
import {
  assertDeclarationGraph,
  assertExpectedDiagnostic,
} from "../../scripts/check-type-fixtures.ts";
import { resolve } from "node:path";
import type { RejectionCase } from "../types/rejections.ts";

const source = "const value = 1;\nvalue.missing;\nvalue.other;\n";
const fixture: RejectionCase = {
  suite: "contracts",
  file: "tests/types/negative/example.ts",
  codes: [2339],
  target: "value.missing",
};
const valid = `${fixture.file}(2,7): error TS2339: Property does not exist.\n`;

test("negative type checks require the intended code, file and expression", () => {
  expect(() => assertExpectedDiagnostic(valid, source, fixture)).not.toThrow();
  expect(() =>
    assertExpectedDiagnostic(valid + "\n/usr/lib/lib.es2022.d.ts\n", source, fixture),
  ).not.toThrow();
  for (const output of [
    "",
    valid.replace("TS2339", "TS2305"),
    valid.replace("example.ts", "wrong.ts"),
    valid.replace("(2,7)", "(3,7)"),
    valid + valid,
    valid + "error TS6053: Missing input file.\n",
    valid.replace("(2,7)", "(200,7)"),
  ])
    expect(() => assertExpectedDiagnostic(output, source, fixture)).toThrow();
});

test("negative type checks reject missing or ambiguous expression anchors", () => {
  expect(() => assertExpectedDiagnostic(valid, source, { ...fixture, target: "absent" })).toThrow();
  expect(() => assertExpectedDiagnostic(valid, source + "value.missing;", fixture)).toThrow();
});

test("declaration consumers must load emitted files without falling back to source", () => {
  const artifact = resolve(".test-artifacts/index.d.ts");
  const sourceDirectory = resolve("src");
  expect(() => assertDeclarationGraph(artifact + "\n", artifact, sourceDirectory)).not.toThrow();
  expect(() => assertDeclarationGraph("", artifact, sourceDirectory)).toThrow();
  expect(() => assertDeclarationGraph("", artifact, sourceDirectory, false)).not.toThrow();
  expect(() =>
    assertDeclarationGraph(resolve("src/index.ts"), artifact, sourceDirectory, false),
  ).toThrow();
  expect(() =>
    assertDeclarationGraph(`${artifact}\n${resolve("src/index.ts")}\n`, artifact, sourceDirectory),
  ).toThrow();
});
