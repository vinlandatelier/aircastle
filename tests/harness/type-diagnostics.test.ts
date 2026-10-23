import { expect, test } from "bun:test";
import { assertExpectedDiagnostic } from "../../scripts/check-type-fixtures.ts";
import type { RejectionCase } from "../types/rejections.ts";

const source = "const value = 1;\nvalue.missing;\nvalue.other;\n";
const fixture: RejectionCase = { suite: "contracts", file: "tests/types/negative/example.ts", codes: [2339], target: "value.missing" };
const valid = `${fixture.file}(2,7): error TS2339: Property does not exist.\n`;

test("negative type checks require the intended code, file and expression", () => {
  expect(() => assertExpectedDiagnostic(valid, source, fixture)).not.toThrow();
  for (const output of [
    "", valid.replace("TS2339", "TS2305"), valid.replace("example.ts", "wrong.ts"),
    valid.replace("(2,7)", "(3,7)"), valid + valid,
    valid + "error TS6053: Missing input file.\n", valid.replace("(2,7)", "(200,7)"),
  ]) expect(() => assertExpectedDiagnostic(output, source, fixture)).toThrow();
});

test("negative type checks reject missing or ambiguous expression anchors", () => {
  expect(() => assertExpectedDiagnostic(valid, source, { ...fixture, target: "absent" })).toThrow();
  expect(() => assertExpectedDiagnostic(valid, source + "value.missing;", fixture)).toThrow();
});
