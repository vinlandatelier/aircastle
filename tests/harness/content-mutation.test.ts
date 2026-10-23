import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "vite-plus/test";

for (const [replacement, expected] of [
  ["2", "valid"],
  ['"invalid"', "compile-error"],
] as const) {
  test(`mutation classification supports a new module and separates ${expected}`, () => {
    const root = mkdtempSync(resolve("packages/contracts/.mutation-types-control-"));
    try {
      mkdirSync(join(root, "src"));
      mkdirSync(join(root, "reports"));
      const source = "export const value: number = 1;\n";
      writeFileSync(join(root, "src/value.ts"), source);
      writeFileSync(
        join(root, "tsconfig.json"),
        JSON.stringify({ extends: resolve("tsconfig.json"), include: ["src/**/*.ts"] }),
      );
      const start = source.indexOf("1");
      const report = join(root, "reports/mutation.json");
      writeFileSync(
        report,
        JSON.stringify({
          files: {
            "src/value.ts": {
              source,
              mutants: [
                {
                  id: "0",
                  replacement,
                  location: {
                    start: { line: 1, column: start + 1 },
                    end: { line: 1, column: start + 2 },
                  },
                  status: "Survived",
                },
              ],
            },
          },
        }),
      );
      const execution = spawnSync(
        "bun",
        ["packages/schema/scripts/classify-mutations.ts", "reports/mutation.json", root, "src"],
        { cwd: resolve("."), encoding: "utf8", timeout: 30_000, stdio: "pipe" },
      );
      expect(execution.status, execution.stdout + execution.stderr).toBe(0);
      const result = JSON.parse(readFileSync(join(root, "reports/classification.json"), "utf8"));
      expect(result.summary.total).toBe(1);
      expect(result.mutants[0].validity).toBe(expected);
      expect(result.summary.compileErrors).toBe(expected === "compile-error" ? 1 : 0);
      expect(result.summary.validSurvived).toBe(expected === "valid" ? 1 : 0);
      expect(readFileSync(join(root, "src/value.ts"), "utf8")).toBe(source);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 40_000);
}
