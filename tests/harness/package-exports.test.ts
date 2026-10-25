import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "vite-plus/test";

const packagesDirectory = resolve("packages");
const workspacePackages = readdirSync(packagesDirectory).filter((name) =>
  existsSync(join(packagesDirectory, name, "package.json")),
);

test.each(workspacePackages)(
  "%s exports TypeScript source first under the development condition",
  (name) => {
    const directory = join(packagesDirectory, name);
    const metadata: { exports?: Record<string, Record<string, string>> } = JSON.parse(
      readFileSync(join(directory, "package.json"), "utf8"),
    );
    const entries = Object.entries(metadata.exports ?? {});
    expect(entries.length).toBeGreaterThan(0);
    for (const [subpath, conditions] of entries) {
      const [firstCondition, target] = Object.entries(conditions)[0] ?? [];
      expect({ subpath, firstCondition }).toEqual({ subpath, firstCondition: "development" });
      expect(target).toMatch(/^\.\/src\/.+\.ts$/);
      expect(existsSync(join(directory, target!)), `${name} ${subpath} -> ${target}`).toBe(true);
    }
  },
);
