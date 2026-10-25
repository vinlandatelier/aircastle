import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "vite-plus/test";

const ungatedWorkspaces = new Set(["apps/web"]);
const testedWorkspaces = ["packages", "apps"]
  .flatMap((parent) => readdirSync(resolve(parent)).map((name) => `${parent}/${name}`))
  .filter((directory) => existsSync(resolve(directory, "package.json")))
  .filter((directory) => !ungatedWorkspaces.has(directory))
  .filter((directory) => {
    const metadata: { scripts?: Record<string, string> } = JSON.parse(
      readFileSync(resolve(directory, "package.json"), "utf8"),
    );
    return metadata.scripts?.test !== undefined;
  });

test("finds the tested workspaces", () => {
  expect(testedWorkspaces).toContain("packages/core");
  expect(testedWorkspaces).toContain("apps/api");
});

test.each(testedWorkspaces)("%s runs its tests behind coverage thresholds", async (directory) => {
  const metadata: { scripts: Record<string, string> } = JSON.parse(
    readFileSync(resolve(directory, "package.json"), "utf8"),
  );
  expect(metadata.scripts["test:coverage"]).toBe("vp test --coverage");
  const config: {
    default: {
      test?: {
        coverage?: {
          provider?: string;
          include?: string[];
          reporter?: string[];
          thresholds?: object;
        };
      };
    };
  } = await import(pathToFileURL(join(resolve(directory), "vite.config.ts")).href);
  const coverage = config.default.test?.coverage;
  expect(coverage?.provider).toBe("v8");
  expect(coverage?.include).toEqual(["src/**/*.ts"]);
  expect(coverage?.reporter).toContain("json-summary");
  expect(Object.keys(coverage?.thresholds ?? {}).sort()).toEqual([
    "branches",
    "functions",
    "lines",
    "statements",
  ]);
});
