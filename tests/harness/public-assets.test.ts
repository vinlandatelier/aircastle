import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, test } from "vite-plus/test";

const webRoot = "apps/web";
const publicRoot = join(webRoot, "public");
const sourceFile = /\.(?:ts|tsx|mts|mjs|css|html)$/;
const testFile = /\.(?:test|spec)\.\w+$/;

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

const sources = [
  ...filesUnder(join(webRoot, "src")),
  ...filesUnder(join(webRoot, "scripts")),
  join(webRoot, "index.html"),
]
  .filter((path) => sourceFile.test(path) && !testFile.test(path))
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");

test("every public web asset is named by its full path in source, so a search finds its users", () => {
  const assets = filesUnder(publicRoot).map((path) => relative(publicRoot, path));
  expect(assets.length).toBeGreaterThan(0);
  expect(assets.filter((asset) => !sources.includes(asset))).toEqual([]);
});
