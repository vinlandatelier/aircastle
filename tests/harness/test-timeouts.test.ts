import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "vite-plus/test";

const root = resolve(import.meta.dirname, "../..");
const postgresPackages = new Set(["postgres", "@aircastle/adapter-postgres"]);
const dependencyFields = ["dependencies", "devDependencies"];
const exempt = new Map([
  [
    "apps/web",
    "Postgres serves the Playwright journeys in e2e/, which set their own timeouts. Vitest runs src/ against HTTP doubles.",
  ],
]);

function reachesPostgres(directory: string) {
  const manifest = JSON.parse(
    readFileSync(join(root, directory, "package.json"), "utf8"),
  ) as Record<string, Record<string, string> | undefined>;
  return dependencyFields.some((field) =>
    Object.keys(manifest[field] ?? {}).some((name) => postgresPackages.has(name)),
  );
}

test("every package whose tests can reach Postgres gives each test and hook 30 s", async () => {
  const directories = [
    ".",
    ...["apps", "packages"].flatMap((parent) =>
      readdirSync(join(root, parent)).map((name) => join(parent, name)),
    ),
  ].filter(
    (directory) =>
      existsSync(join(root, directory, "package.json")) &&
      existsSync(join(root, directory, "vite.config.ts")) &&
      reachesPostgres(directory),
  );
  const timeouts = await Promise.all(
    directories
      .filter((directory) => !exempt.has(directory))
      .map(async (directory) => {
        const { default: config } = (await import(
          pathToFileURL(join(root, directory, "vite.config.ts")).href
        )) as { default: { test?: { testTimeout?: number; hookTimeout?: number } } };
        return {
          directory,
          testTimeout: config.test?.testTimeout,
          hookTimeout: config.test?.hookTimeout,
        };
      }),
  );

  expect(directories).toEqual(
    expect.arrayContaining(["apps/api", "packages/adapter-postgres", ...exempt.keys()]),
  );
  expect(
    timeouts.filter((entry) => entry.testTimeout !== 30_000 || entry.hookTimeout !== 30_000),
  ).toEqual([]);
});
