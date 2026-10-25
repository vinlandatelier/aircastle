import { spawnSync } from "node:child_process";
import { expect, test } from "vite-plus/test";
import { inspectCode, workspaceCycles, type Workspace } from "../../scripts/check-code-policy.ts";
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

test.each([
  ["call", "sql.unsafe(query);"],
  ["typed transaction call", "transaction.unsafe<Row[]>(query, [id]);"],
  ["optional call", "sql?.unsafe(query);"],
  ["computed access", 'sql["unsafe"](query);'],
  ["reference", "const run = sql.unsafe;"],
  ["template computed access", "sql[`unsafe`](query);"],
  ["destructuring", "const { unsafe } = sql;"],
  ["renamed destructuring", "const { unsafe: raw } = sql;"],
  ["string-keyed destructuring", 'const { "unsafe": raw } = sql;'],
  ["parameter destructuring", "const run = ({ unsafe }: Sql) => unsafe(query);"],
])("rejects raw SQL outside the identifier helpers: %s", (_name, source) => {
  expect(inspectCode("packages/adapter-postgres/src/index.ts", source)).toEqual([
    expect.objectContaining({ rule: "unsafe-sql" }),
  ]);
});

test("accepts raw SQL in the identifier helpers and unsafe-looking literals elsewhere", () => {
  for (const file of [
    "packages/adapter-postgres/src/identifier.ts",
    "packages/adapter-postgres/src/test-support/database.ts",
  ])
    expect(inspectCode(file, "sql.unsafe(query);")).toEqual([]);
  expect(
    inspectCode("value.ts", 'const code = "sql.unsafe(query)"; const unsafe = { unsafe: 1 };'),
  ).toEqual([]);
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

const workspaces: Workspace[] = [
  { directory: "", name: "aircastle", dependencies: ["@aircastle/core", "@aircastle/contracts"] },
  { directory: "packages/contracts", name: "@aircastle/contracts", dependencies: [] },
  { directory: "packages/core", name: "@aircastle/core", dependencies: ["@aircastle/contracts"] },
  { directory: "apps/api", name: "@aircastle/api", dependencies: ["@aircastle/core"] },
];
const boundaryRules = (file: string, source: string) =>
  inspectCode(file, source, workspaces).map((violation) => violation.rule);

test.each([
  ["static import", 'import { value } from "../../contracts/src/index.ts";'],
  ["type import", 'import type { Value } from "../../contracts/src/index.ts";'],
  ["re-export", 'export * from "../../contracts/src/index.ts";'],
  ["named re-export", 'export { value } from "../../contracts/src/index.ts";'],
  ["dynamic import", 'const loaded = import("../../contracts/src/index.ts");'],
  ["template dynamic import", "const loaded = import(`../../contracts/src/index.ts`);"],
  ["import type query", 'type Value = import("../../contracts/src/index.ts").Value;'],
  ["repository escape", 'import { value } from "../../../../outside.ts";'],
])("rejects relative imports into another workspace: %s", (_name, source) => {
  expect(boundaryRules("packages/core/src/value.ts", source)).toEqual([
    "cross-workspace-relative-import",
  ]);
});

test("rejects relative imports between the repository root and workspaces", () => {
  expect(
    boundaryRules("tests/fixtures/server.ts", 'import { app } from "../../apps/api/src/app.ts";'),
  ).toEqual(["cross-workspace-relative-import"]);
  expect(
    boundaryRules(
      "apps/api/src/value.ts",
      'import { setup } from "../../../tests/support/setup.ts";',
    ),
  ).toEqual(["cross-workspace-relative-import"]);
});

test("accepts relative imports that stay inside their workspace", () => {
  expect(
    boundaryRules("packages/core/tests/value.test.ts", 'import { value } from "../src/index.ts";'),
  ).toEqual([]);
  expect(
    boundaryRules("apps/api/src/features/content/index.ts", 'import { app } from "../../app.ts";'),
  ).toEqual([]);
  expect(
    boundaryRules("tests/harness/value.test.ts", 'import { check } from "../../scripts/check.ts";'),
  ).toEqual([]);
});

test("rejects workspace packages the importing package does not declare", () => {
  expect(
    boundaryRules("packages/contracts/src/value.ts", 'import { value } from "@aircastle/core";'),
  ).toEqual(["undeclared-workspace-import"]);
  expect(
    boundaryRules("packages/core/src/value.ts", 'const api = import("@aircastle/api/routes");'),
  ).toEqual(["undeclared-workspace-import"]);
});

test("accepts declared workspace packages, the package itself and external packages", () => {
  expect(
    boundaryRules(
      "packages/core/src/value.ts",
      'import { contract } from "@aircastle/contracts";\nimport { core } from "@aircastle/core";\nimport { hono } from "hono";',
    ),
  ).toEqual([]);
  expect(boundaryRules("tests/value.test.ts", 'import { core } from "@aircastle/core";')).toEqual(
    [],
  );
});

test("reports workspace dependency cycles", () => {
  expect(workspaceCycles(workspaces)).toEqual([]);
  expect(
    workspaceCycles(
      [
        ...workspaces,
        {
          directory: "packages/adapter",
          name: "@aircastle/adapter",
          dependencies: ["@aircastle/core"],
        },
      ].map((workspace) =>
        workspace.name === "@aircastle/core"
          ? { ...workspace, dependencies: [...workspace.dependencies, "@aircastle/adapter"] }
          : workspace,
      ),
    ),
  ).toEqual([["@aircastle/core", "@aircastle/adapter", "@aircastle/core"]]);
});

test("the policy command enforces workspace import boundaries from package manifests", () => {
  const root = resolve(import.meta.dirname, "../..");
  const directory = mkdtempSync(join(tmpdir(), "aircastle-boundary-policy-"));
  const write = (file: string, content: string) => {
    mkdirSync(join(directory, file, ".."), { recursive: true });
    writeFileSync(join(directory, file), content);
  };
  const run = () =>
    spawnSync("bun", [join(root, "scripts/check-code-policy.ts"), directory], {
      cwd: directory,
      encoding: "utf8",
    });
  try {
    expect(spawnSync("git", ["init", "--quiet"], { cwd: directory }).status).toBe(0);
    write("package.json", JSON.stringify({ name: "root", workspaces: ["packages/*"] }));
    write("packages/one/package.json", JSON.stringify({ name: "@probe/one" }));
    write("packages/two/package.json", JSON.stringify({ name: "@probe/two" }));
    write("packages/two/src/index.ts", "export const two = 2;\n");
    write("packages/one/src/index.ts", 'export { two } from "../../two/src/index.ts";\n');
    const relative = run();
    expect(relative.status).not.toBe(0);
    expect(relative.stderr).toContain(
      "packages/one/src/index.ts:1:21 cross-workspace-relative-import",
    );

    write("packages/one/src/index.ts", 'export { two } from "@probe/two";\n');
    const undeclared = run();
    expect(undeclared.status).not.toBe(0);
    expect(undeclared.stderr).toContain(
      "packages/one/src/index.ts:1:21 undeclared-workspace-import",
    );

    write(
      "packages/one/package.json",
      JSON.stringify({ name: "@probe/one", dependencies: { "@probe/two": "workspace:*" } }),
    );
    expect(run().status).toBe(0);

    write(
      "packages/two/package.json",
      JSON.stringify({ name: "@probe/two", devDependencies: { "@probe/one": "workspace:*" } }),
    );
    const cycle = run();
    expect(cycle.status).not.toBe(0);
    expect(cycle.stderr).toContain("workspace-cycle @probe/one -> @probe/two -> @probe/one");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

const swallowed = (file: string, source: string) =>
  inspectCode(file, source).filter((entry) => entry.rule === "swallowed-error");

test.each([
  ["bare catch", "try { run(); } catch {}"],
  ["bare catch with a fallback", "try { run(); } catch { return fallback; }"],
  ["unused binding", "try { run(); } catch (error) { return fallback; }"],
  ["void read", "try { run(); } catch (error) { void error; return fallback; }"],
  ["discarded read", "try { run(); } catch (error) { error; return fallback; }"],
  ["unused destructured binding", "try { run(); } catch ({ message }) { return fallback; }"],
  [
    "binding name used only as an object key",
    "try { run(); } catch (error) { return { error: 1 }; }",
  ],
  ["binding name used only as a property", "try { run(); } catch (error) { return value.error; }"],
  ["promise handler without a parameter", "promise.catch(() => fallback);"],
  ["promise handler with an unused parameter", "promise.catch((error) => fallback);"],
  ["optional promise handler", "promise?.catch(function () { return fallback; });"],
  ["then rejection handler", "promise.then(use, () => fallback);"],
])("rejects catch clauses in package source that swallow the error: %s", (_name, source) => {
  expect(swallowed("packages/core/src/value.ts", `function value() { ${source} }`)).toHaveLength(1);
});

test.each([
  ["rethrow", "try { run(); } catch (error) { throw error; }"],
  [
    "expected error narrowed and others rethrown",
    "try { run(); } catch (error) { if (error instanceof SyntaxError) return fallback; throw error; }",
  ],
  ["reported", "try { run(); } catch (error) { report(error); }"],
  ["destructured and used", "try { run(); } catch ({ message }) { report(message); }"],
  ["computed key", "try { run(); } catch (error) { return { [error]: 1 }; }"],
  ["promise handler that rethrows", "promise.catch((error) => { throw error; });"],
  ["handler passed by reference", "promise.catch(report);"],
  ["then fulfilment handler only", "promise.then(() => fallback);"],
  ["then rejection handler that reports", "promise.then(use, (error) => report(error));"],
])("accepts catch clauses that use the bound error: %s", (_name, source) => {
  expect(swallowed("packages/core/src/value.test.ts", `function value() { ${source} }`)).toEqual(
    [],
  );
});

test("checks swallowed errors only in package and app source", () => {
  for (const file of [
    "scripts/value.ts",
    "packages/core/tests/value.ts",
    "apps/api/tests/value.ts",
  ])
    expect(swallowed(file, "try { run(); } catch {}")).toEqual([]);
  expect(swallowed("apps/web/src/value.ts", "try { run(); } catch {}")).toHaveLength(1);
});

test("allows only the counted deliberate catch-alls in a listed file", () => {
  const catchAll = "try { run(); } catch { fallback(); }\n";
  expect(swallowed("packages/cli/src/index.ts", catchAll + catchAll)).toEqual([]);
  expect(swallowed("packages/cli/src/index.ts", catchAll + catchAll + catchAll)).toEqual([
    { line: 3, column: 16, rule: "swallowed-error" },
  ]);
  expect(swallowed("packages/cli/src/other.ts", catchAll)).toHaveLength(1);
});

test("rejects an allowance that no longer matches its file", () => {
  expect(
    inspectCode("packages/cli/src/index.ts", "try { run(); } catch { fallback(); }\n"),
  ).toEqual([{ line: 1, column: 1, rule: "stale-catch-allowance" }]);
});
