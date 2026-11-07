import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { expect, test } from "vite-plus/test";

const root = resolve(import.meta.dirname, "../..");
const dependencyFields = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

function trackedFiles(pattern: string): string[] {
  const git = spawnSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z", pattern],
    { cwd: root, encoding: "utf8" },
  );
  return [...new Set(git.stdout.split("\0").filter(Boolean))].sort();
}

test("every manifest takes typescript from the catalog", () => {
  const manifests = trackedFiles("*package.json").filter(
    (file) => file === "package.json" || /^(apps|packages)\/[^/]+\/package\.json$/.test(file),
  );
  const pins = manifests.flatMap((file) => {
    const manifest = JSON.parse(readFileSync(join(root, file), "utf8")) as Record<string, unknown>;
    return dependencyFields.flatMap((field) => {
      const version = (manifest[field] as Record<string, string> | undefined)?.typescript;
      return version === undefined ? [] : [{ file, field, version }];
    });
  });

  expect(pins.map((pin) => pin.file)).toContain("apps/web/package.json");
  expect(pins.filter((pin) => pin.version !== "catalog:")).toEqual([]);
});

test("every compiled tsconfig enables the repository's strict index and optional rules", () => {
  const tsc = resolve(root, "node_modules/.bin/tsc");
  const configs = trackedFiles("*tsconfig*.json").flatMap((file) => {
    const shown = spawnSync(tsc, ["--showConfig", "-p", file], { cwd: root, encoding: "utf8" });
    expect(shown.status, `${file}: ${shown.stderr}${shown.stdout}`).toBe(0);
    const config = JSON.parse(shown.stdout) as {
      compilerOptions?: Record<string, unknown>;
      files?: string[];
      include?: string[];
    };
    if (!config.files?.length && !config.include?.length) return [];
    return [
      {
        file,
        exactOptionalPropertyTypes: config.compilerOptions?.exactOptionalPropertyTypes,
        noUncheckedIndexedAccess: config.compilerOptions?.noUncheckedIndexedAccess,
      },
    ];
  });

  expect(configs.map((config) => dirname(config.file))).toContain("apps/web");
  expect(
    configs.filter(
      (config) =>
        config.exactOptionalPropertyTypes !== true || config.noUncheckedIndexedAccess !== true,
    ),
  ).toEqual([]);
});
