import { expect, test } from "bun:test";
import { inspectCode } from "../../scripts/check-code-policy.ts";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
])("rejects ordinary comments: %s", (_name, source) => {
  expect(inspectCode("value.ts", source)).toHaveLength(1);
});

test.each(["@ts-expect-error", "@ts-ignore", "@ts-nocheck"])("rejects %s even in documentation", (directive) => {
  for (const source of [`// ${directive}\nconst value = 1;`, `/** ${directive} */\nexport const value = 1;`]) {
    expect(inspectCode("value.ts", source).some((entry) => entry.rule === "type-suppression")).toBe(true);
  }
});

test.each([
  "/** Public API documentation. */\nexport const value = 1;",
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
  expect(inspectCode("value.ts", "const value = `literal // ${1 /* explanation */}`;")).toHaveLength(1);
});

test("fails closed on source the parser cannot understand", () => {
  expect(() => inspectCode("value.ts", "const = ;")).toThrow();
});

test("the policy command checks untracked files and preserves docstrings", () => {
  const root = resolve(import.meta.dir, "../..");
  const directory = mkdtempSync(join(tmpdir(), "aircastle-policy-"));
  const file = join(directory, "probe.ts");
  const run = () => Bun.spawnSync([process.execPath, join(root, "scripts/check-code-policy.ts"), directory], {
    cwd: directory, stdout: "pipe", stderr: "pipe",
  });
  try {
    const initialized = Bun.spawnSync(["git", "init", "--quiet"], { cwd: directory });
    expect(initialized.exitCode).toBe(0);
    writeFileSync(file, "// ordinary explanation\nexport const value = 1;\n");
    const ordinary = run();
    expect(ordinary.exitCode).not.toBe(0);
    expect(new TextDecoder().decode(ordinary.stderr)).toContain("ordinary-comment");
    writeFileSync(file, "/** Public API documentation. */\nexport const value = 1;\n");
    expect(run().exitCode).toBe(0);
    expect(Bun.spawnSync(["git", "add", "probe.ts"], { cwd: directory }).exitCode).toBe(0);
    writeFileSync(file, "/** @ts-ignore */\nexport const value = 1;\n");
    const suppression = run();
    expect(suppression.exitCode).not.toBe(0);
    expect(new TextDecoder().decode(suppression.stderr)).toContain("type-suppression");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
