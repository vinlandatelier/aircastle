import { readFileSync } from "node:fs";
import { expect, test } from "vite-plus/test";

const scripts: Readonly<Record<string, string>> = JSON.parse(
  readFileSync("package.json", "utf8"),
).scripts;

function scriptsRunBy(text: string): string[] {
  return [...text.matchAll(/\bvp (?:-C \S+ )?run [\w:-]+/g)].map((match) => match[0]);
}

test("every package script that CI runs is part of vp run check", () => {
  const ciScripts = scriptsRunBy(readFileSync(".github/workflows/ci.yml", "utf8"));
  expect(ciScripts.length).toBeGreaterThan(0);
  expect(ciScripts.filter((script) => !scriptsRunBy(scripts.check ?? "").includes(script))).toEqual(
    [],
  );
});
