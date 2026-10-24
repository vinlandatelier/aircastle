import { expect, test } from "vite-plus/test";
import { mkdtemp, readFile, rm, writeFile, mkdir, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyEdits, type Edit } from "./index.ts";

const edit: Edit = {
  path: "src/value.ts",
  expectedBlob: "fb8f610c89d978e2a0b113577c9c034323a8f3f3",
  content: "fixed\n",
};
test("materializer checks Git blob identity before changing a file", async () => {
  const root = await mkdtemp(join(tmpdir(), "aircastle-ai-test-"));
  try {
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src/value.ts"), "original\n");
    await expect(applyEdits(root, [edit])).rejects.toThrow("blob");
    expect(await readFile(join(root, "src/value.ts"), "utf8")).toBe("original\n");
    await applyEdits(root, [{ ...edit, expectedBlob: "4b48deed3a433909bfd6b6ab3d4b91348b6af464" }]);
    expect(await readFile(join(root, "src/value.ts"), "utf8")).toBe("fixed\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("materializer refuses a symlink ancestor without touching its target", async () => {
  const root = await mkdtemp(join(tmpdir(), "aircastle-ai-test-"));
  const outside = await mkdtemp(join(tmpdir(), "aircastle-ai-outside-"));
  try {
    await writeFile(join(outside, "value.ts"), "original\n");
    await symlink(outside, join(root, "src"));
    await expect(applyEdits(root, [edit])).rejects.toThrow("Symlink");
    expect(await readFile(join(outside, "value.ts"), "utf8")).toBe("original\n");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("the real Node 24 CLI fails honestly when App credentials are absent", async () => {
  const { spawnSync } = await import("node:child_process");
  const result = spawnSync(process.execPath, ["scripts/ai-automation/cli.ts", "setup"], {
    cwd: process.cwd(),
    env: {},
    encoding: "utf8",
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("setup_required: AI_GITHUB_TOKEN is missing");
});
