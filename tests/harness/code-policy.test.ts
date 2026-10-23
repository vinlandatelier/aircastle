import { spawnSync } from "node:child_process";
import { expect, test } from "vite-plus/test";
import { inspectCode } from "../../scripts/check-code-policy.ts";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test.each([
  ["line", "// explanation\nconst value = 1;"],
  ["trailing", "const value = 1; // explanation"],
  ["block", "const value = /* explanation */ 1;"],
  ["closing brace", "function value() { /* explanation */ }"],
  ["empty block", "/**/"],
  ["decorative block", "/*** explanation */"],
  ["template expression", "const value = `${1 /* explanation */}`;"],
  ["inline disguised docstring", "const value = /** explanation */ 1;"],
  ["function-body disguised docstring", "function value() { /** explanation */ return 1; }"],
  ["unattached docstring", "/** explanation */"],
])("rejects ordinary comments: %s", (_name, source) => {
  expect(inspectCode("value.ts", source)).toHaveLength(1);
});

test.each(["@ts-expect-error", "@ts-ignore", "@ts-nocheck"])(
  "rejects %s even in documentation",
  (directive) => {
    for (const source of [
      `// ${directive}\nconst value = 1;`,
      `/** ${directive} */\nexport const value = 1;`,
    ]) {
      expect(
        inspectCode("value.ts", source).some((entry) => entry.rule === "type-suppression"),
      ).toBe(true);
    }
  },
);

test.each([
  "/** Public API documentation. */\nexport const value = 1;",
  "interface Value { /** Public field. */ readonly field: string; }",
  "class Value { /** Public method. */ method() {} }",
  'const url = "https://example.com";',
  'const example = "// @ts-ignore";',
  "const value = `/* literal */ // text`;",
  "const pattern = /https?:\\/\\//;",
  "const pattern = /[/][*]/;",
])("accepts docstrings and comment-like literals: %s", (source) => {
  expect(inspectCode("value.ts", source)).toEqual([]);
});

test("handles JSX text and expression comments independently", () => {
  expect(inspectCode("value.tsx", "const value = <div>// literal /* text */</div>;")).toEqual([]);
  expect(inspectCode("value.jsx", "const value = <div>{/* explanation */}</div>;")).toHaveLength(1);
});

test("checks comments after regular expressions and inside template substitutions", () => {
  expect(inspectCode("value.ts", "const value = /[/][*]/; // explanation")).toHaveLength(1);
  expect(
    inspectCode("value.ts", "const value = `literal // ${1 /* explanation */}`;"),
  ).toHaveLength(1);
});

test("fails closed on source the parser cannot understand", () => {
  expect(() => inspectCode("value.ts", "const = ;")).toThrow();
});

test("the policy command checks untracked files and preserves docstrings", () => {
  const root = resolve(import.meta.dirname, "../..");
  const directory = mkdtempSync(join(tmpdir(), "aircastle-policy-"));
  const file = join(directory, "probe.ts");
  const run = () =>
    spawnSync("bun", [join(root, "scripts/check-code-policy.ts"), directory], {
      cwd: directory,
      encoding: "utf8",
    });
  try {
    const initialized = spawnSync("git", ["init", "--quiet"], { cwd: directory });
    expect(initialized.status).toBe(0);
    writeFileSync(file, "// ordinary explanation\nexport const value = 1;\n");
    const ordinary = run();
    expect(ordinary.status).not.toBe(0);
    expect(ordinary.stderr).toContain("ordinary-comment");
    writeFileSync(file, "/** Public API documentation. */\nexport const value = 1;\n");
    expect(run().status).toBe(0);
    expect(spawnSync("git", ["add", "probe.ts"], { cwd: directory }).status).toBe(0);
    writeFileSync(file, "/** @ts-ignore */\nexport const value = 1;\n");
    const suppression = run();
    expect(suppression.status).not.toBe(0);
    expect(suppression.stderr).toContain("type-suppression");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("the policy command preserves vendored shadcn code and checks authored skills", () => {
  const root = resolve(import.meta.dirname, "../..");
  const directory = mkdtempSync(join(tmpdir(), "aircastle-vendor-policy-"));
  const run = () =>
    spawnSync("bun", [join(root, "scripts/check-code-policy.ts"), directory], {
      cwd: directory,
      encoding: "utf8",
    });
  try {
    expect(spawnSync("git", ["init", "--quiet"], { cwd: directory }).status).toBe(0);
    const vendor = join(directory, ".agents/skills/shadcn");
    mkdirSync(vendor, { recursive: true });
    writeFileSync(join(vendor, "sample.ts"), "// upstream example\nexport const value = 1;\n");
    expect(run().status).toBe(0);

    const authored = join(directory, ".agents/skills/worktree");
    mkdirSync(authored, { recursive: true });
    writeFileSync(join(authored, "sample.ts"), "// authored comment\nexport const value = 1;\n");
    const result = run();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(".agents/skills/worktree/sample.ts");
    expect(result.stderr).toContain("ordinary-comment");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
