import { expect, test } from "vite-plus/test";
import { mkdtemp, readFile, rm, writeFile, mkdir, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { digest, type Edit, type Job } from "./index.ts";
import { applyEdits, renderPatch } from "./materialize.ts";
import { verificationPlan } from "./checks.ts";

const edit: Edit = {
  path: "src/value.ts",
  expectedBlob: "fb8f610c89d978e2a0b113577c9c034323a8f3f3",
  content: "fixed\n",
};

test("scoped verification runner executes only the selected behavior file", async () => {
  const { spawnSync } = await import("node:child_process");
  const root = await mkdtemp(join(tmpdir(), "aircastle-ai-filter-"));
  try {
    const web = join(root, "apps/web");
    await mkdir(join(web, "src/features/navigation"), { recursive: true });
    await symlink(join(process.cwd(), "node_modules"), join(root, "node_modules"));
    await symlink(join(process.cwd(), "apps/web/node_modules"), join(web, "node_modules"));
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ private: true, workspaces: ["apps/*"] }),
    );
    await writeFile(
      join(web, "package.json"),
      JSON.stringify({ name: "filter-fixture", type: "module", scripts: { test: "vp test run" } }),
    );
    await writeFile(
      join(web, "vite.config.ts"),
      'import { defineConfig } from "vite-plus"; export default defineConfig({ test: { environment: "node", maxWorkers: 1, include: ["src/**/*.test.tsx"] } });',
    );
    await writeFile(
      join(web, "src/features/navigation/index.test.tsx"),
      'import { test, expect } from "vite-plus/test"; test("selected", () => expect(1).toBe(1));',
    );
    await writeFile(
      join(web, "src/unrelated.test.tsx"),
      'throw new Error("Unrelated test must not execute");',
    );
    const commands = verificationPlan([
      { ...edit, path: "apps/web/src/features/navigation/index.ts" },
    ]);
    const command = commands!.at(-1)!;
    const result = spawnSync(command[0]!, command.slice(1), {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${join(process.cwd(), "node_modules/.bin")}:${process.env.PATH}`,
      },
      encoding: "utf8",
      timeout: 30000,
    });
    expect(result.status, result.stdout + result.stderr).toBe(0);
    const stdout = stripVTControlCharacters(result.stdout);
    expect(stdout).toMatch(/Test Files\s+1 passed/);
    expect(stdout).toMatch(/Tests\s+1 passed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 35000);
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

test("downloadable patch applies to the captured source including a missing final newline", async () => {
  const { snapshot } = await import("./fixtures.ts");
  const { spawnSync } = await import("node:child_process");
  const root = await mkdtemp(join(tmpdir(), "aircastle-ai-patch-"));
  try {
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src/value.ts"), snapshot.files[0]!.text!);
    const fix = {
      summary: "Correct value",
      edits: [
        {
          path: "src/value.ts",
          expectedBlob: snapshot.files[0]!.sha,
          content: "fixed without newline",
        },
      ],
    };
    await writeFile(join(root, "change.patch"), renderPatch(fix, snapshot));
    const result = spawnSync("git", ["apply", "change.patch"], { cwd: root, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(await readFile(join(root, "src/value.ts"), "utf8")).toBe("fixed without newline");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test.each(["create", "delete"] as const)(
  "downloadable patch supports an empty file %s",
  async (kind) => {
    const { snapshot } = await import("./fixtures.ts");
    const { spawnSync } = await import("node:child_process");
    const root = await mkdtemp(join(tmpdir(), "aircastle-ai-empty-patch-"));
    try {
      await mkdir(join(root, "src"));
      if (kind === "delete") await writeFile(join(root, "src/value.ts"), "");
      const original = {
        ...snapshot,
        files: [
          {
            ...snapshot.files[0]!,
            sha: kind === "create" ? null : snapshot.files[0]!.sha,
            text: kind === "create" ? null : "",
          },
        ],
      };
      const fix = {
        summary: "Empty file",
        edits: [
          {
            path: "src/value.ts",
            expectedBlob: original.files[0]!.sha,
            content: kind === "create" ? "" : null,
          },
        ],
      };
      await writeFile(join(root, "change.patch"), renderPatch(fix, original));
      const result = spawnSync("git", ["apply", "change.patch"], { cwd: root, encoding: "utf8" });
      expect(result.status, result.stderr).toBe(0);
      if (kind === "create") expect(await readFile(join(root, "src/value.ts"), "utf8")).toBe("");
      else await expect(readFile(join(root, "src/value.ts"))).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

test("unsupported scoped verification CLI exits successfully with an unavailable receipt", async () => {
  const { spawnSync } = await import("node:child_process");
  const { snapshot } = await import("./fixtures.ts");
  const root = await mkdtemp(join(tmpdir(), "aircastle-ai-unavailable-"));
  try {
    const path = "src/value.ts";
    const job: Job = {
      version: 1,
      id: "1".repeat(64),
      task: "fix",
      role: "codexImplementer",
      requester: snapshot.author,
      snapshot,
      instructions: "Fix value",
      thread: "",
      control: "e".repeat(40),
      selection: { provider: "openai", model: "fixture", effort: "high" },
      previous: "",
    };
    await mkdir(join(root, "plan"));
    await mkdir(join(root, "model"));
    await writeFile(join(root, "plan", `${job.id}.json`), JSON.stringify(job));
    await writeFile(
      join(root, "model", `${job.id}.json`),
      JSON.stringify({
        id: job.id,
        digest: digest(job),
        selection: job.selection,
        result: {
          summary: "Fix",
          edits: [{ path, expectedBlob: "c".repeat(40), content: "fixed\n" }],
        },
      }),
    );
    const result = spawnSync(process.execPath, ["scripts/ai-automation/cli.ts", "verify"], {
      cwd: process.cwd(),
      env: {
        PATH: "/no-docker-executable",
        AI_DATA_DIR: root,
        AI_OPERATION_ID: job.id,
        AI_CONTROL_SHA: job.control,
        GITHUB_REPOSITORY: "vinlandatelier/aircastle",
      },
      encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(0);
    expect(
      JSON.parse(await readFile(join(root, "verification", `${job.id}.json`), "utf8")),
    ).toMatchObject({ passed: false, commands: null, recipe: digest(null) });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
