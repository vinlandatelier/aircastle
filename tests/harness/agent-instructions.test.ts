import { execFileSync } from "node:child_process";
import { readdirSync, readlinkSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { expect, test } from "vite-plus/test";

const root = resolve(import.meta.dirname, "../..");
const trackedFiles = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
  .split("\n")
  .filter(Boolean);
const skillDirectories = (path: string) =>
  readdirSync(join(root, path), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .map((entry) => entry.name)
    .sort();

const directoriesWith = (name: string) =>
  trackedFiles
    .filter((path) => basename(path) === name && !path.startsWith(".agents/"))
    .map(dirname)
    .sort();

test("every AGENTS.md has a sibling CLAUDE.md and every CLAUDE.md has a sibling AGENTS.md", () => {
  expect(directoriesWith("CLAUDE.md")).toEqual(directoriesWith("AGENTS.md"));
});

test.each(directoriesWith("CLAUDE.md"))("%s/CLAUDE.md links to AGENTS.md", (directory) => {
  expect(readlinkSync(join(root, directory, "CLAUDE.md"))).toBe("AGENTS.md");
});

test("every shared skill has a Claude skill symlink and nothing else", () => {
  const shared = skillDirectories(".agents/skills");
  expect(skillDirectories(".claude/skills")).toEqual(shared);
  for (const name of shared) {
    expect(readlinkSync(join(root, ".claude/skills", name))).toBe(`../../.agents/skills/${name}`);
  }
});
