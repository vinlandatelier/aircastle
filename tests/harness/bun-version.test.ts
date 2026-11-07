import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "vite-plus/test";

const root = resolve(import.meta.dirname, "../..");
const bunVersion = readFileSync(join(root, ".bun-version"), "utf8").trim();
const dependencyFields = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

type Manifest = Record<string, unknown> & {
  packageManager?: string;
  catalog?: Record<string, string>;
  engines?: Record<string, string>;
};

function readManifest(directory: string): Manifest {
  return JSON.parse(readFileSync(join(root, directory, "package.json"), "utf8"));
}

function workspaceDirectories(): string[] {
  return ["apps", "packages"].flatMap((parent) =>
    readdirSync(join(root, parent))
      .map((name) => join(parent, name))
      .filter((directory) => existsSync(join(root, directory, "package.json"))),
  );
}

const rootManifest = readManifest(".");

test(".bun-version holds an exact Bun version", () => {
  expect(bunVersion).toMatch(/^\d+\.\d+\.\d+$/);
});

test("packageManager pins the Bun version from .bun-version", () => {
  expect(rootManifest.packageManager).toBe(`bun@${bunVersion}`);
});

test("the root catalog pins @types/bun to the Bun version", () => {
  expect(rootManifest.catalog?.["@types/bun"]).toBe(bunVersion);
});

test("no manifest repeats the Bun version in engines", () => {
  const pins = [".", ...workspaceDirectories()].filter(
    (directory) => readManifest(directory).engines?.bun !== undefined,
  );

  expect(pins).toEqual([]);
});

test("every manifest takes @types/bun from the catalog", () => {
  const pins = [".", ...workspaceDirectories()].flatMap((directory) => {
    const manifest = readManifest(directory);
    return dependencyFields.flatMap((field) => {
      const version = (manifest[field] as Record<string, string> | undefined)?.["@types/bun"];
      return version === undefined ? [] : [{ directory, field, version }];
    });
  });

  expect(pins.length).toBeGreaterThan(0);
  expect(pins.filter((pin) => pin.version !== "catalog:")).toEqual([]);
});
