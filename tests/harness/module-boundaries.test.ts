import { parse } from "@babel/parser";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { describe, expect, it } from "vite-plus/test";

const root = resolve(import.meta.dirname, "../..");
const sourceRoot = resolve(root, "apps/api/src");
const webRoot = resolve(root, "apps/web/src");
const sourceRoots = [sourceRoot, webRoot];
const modules = [
  resolve(webRoot, "components/shell"),
  ...sourceRoots.flatMap((source) => {
    const features = resolve(source, "features");
    return readdirSync(features, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => resolve(features, entry.name));
  }),
];

const apiRoot = resolve(root, "apps/api");

type Node = Record<string, unknown>;

function nodes(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (value === null || typeof value !== "object") return [];
  const node = value as Node;
  return [node, ...Object.values(node).flatMap(nodes)];
}

function text(value: unknown): string | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const node = value as Node;
  if (node.type === "StringLiteral" && typeof node.value === "string") return node.value;
  if (node.type === "TSLiteralType") return text(node.literal);
  if (node.type !== "TemplateLiteral" || !Array.isArray(node.quasis) || node.quasis.length !== 1)
    return undefined;
  const cooked = ((node.quasis[0] as Node).value as Node).cooked;
  return typeof cooked === "string" ? cooked : undefined;
}

function isCall(value: unknown, name: string): boolean {
  if (value === null || typeof value !== "object") return false;
  const node = value as Node;
  const callee = node.callee as Node | undefined;
  return node.type === "CallExpression" && callee?.type === "Identifier" && callee.name === name;
}

function privateImports(file: string, source: string): string[] {
  const ast = parse(source, { sourceType: "module", plugins: ["typescript", "jsx"] });
  const all = nodes(ast.program);
  const loaders = new Set(
    all
      .filter((node) => node.type === "VariableDeclarator" && isCall(node.init, "createRequire"))
      .map((node) => (node.id as Node).name),
  );
  const fileBase = [dirname(file)];
  const loaderBases = [dirname(file), apiRoot];
  const loads = all.flatMap((node): { specifier: string | undefined; bases: string[] }[] => {
    if (
      node.type === "ImportDeclaration" ||
      node.type === "ExportNamedDeclaration" ||
      node.type === "ExportAllDeclaration"
    )
      return [{ specifier: text(node.source), bases: fileBase }];
    if (node.type === "TSImportType") return [{ specifier: text(node.argument), bases: fileBase }];
    if (node.type === "TSExternalModuleReference")
      return [{ specifier: text(node.expression), bases: fileBase }];
    if (node.type === "ImportExpression")
      return [{ specifier: text(node.source), bases: fileBase }];
    if (node.type !== "CallExpression" || !Array.isArray(node.arguments)) return [];
    const callee = node.callee as Node;
    const specifier = text(node.arguments[0]);
    if (callee.type === "Import" || (callee.type === "Identifier" && callee.name === "require"))
      return [{ specifier, bases: fileBase }];
    if (
      (callee.type === "Identifier" &&
        typeof callee.name === "string" &&
        loaders.has(callee.name)) ||
      isCall(callee, "createRequire")
    )
      return [{ specifier, bases: loaderBases }];
    return [];
  });
  const aliased = file.startsWith(`${webRoot}${sep}`);
  return loads.flatMap(({ specifier, bases }) => {
    if (specifier === undefined) return [];
    const targets =
      aliased && specifier.startsWith("@/")
        ? [resolve(webRoot, specifier.slice(2))]
        : specifier.startsWith(".")
          ? bases.map((base) => resolve(base, specifier))
          : [];
    return targets.some((target) => isPrivate(file, target)) ? [specifier] : [];
  });
}

function isPrivate(file: string, target: string): boolean {
  const owner = modules.find((module) => target.startsWith(`${module}${sep}`));
  if (!owner || file.startsWith(`${owner}${sep}`)) return false;
  return !["index", "index.ts", "index.tsx", "index.js", "index.jsx"].some(
    (entry) => target === resolve(owner, entry),
  );
}

describe("Module entry points", () => {
  it.each([
    "import { access } from './features/content/request.ts';",
    "import type { Access } from './features/content/request.ts';",
    "import './features/content/request.ts';",
    "export { access } from './features/content/request.ts';",
    "export type { Access } from './features/content/request.ts';",
    "export * from './features/content/request.ts';",
    "export * as request from './features/content/request.ts';",
    "type Access = import('./features/content/request.ts').Access;",
    "type Access = typeof import('./features/content/request.ts').access;",
    "export type Access = { nested: Array<ReturnType<typeof import('./features/content/request.ts').access>> };",
    "function example(value: { access: import('./features/content/request.ts').Access }) {}",
    "const request = await import('./features/content/request.ts');",
    "const request = import(`./features/content/request.ts`);",
    "const request = require('./features/content/request.ts');",
    "import { createRequire } from 'node:module'; const load = createRequire(import.meta.url); load('./features/content/request.ts');",
    "createRequire(import.meta.url)('./features/content/request.ts');",
  ])("rejects external API access: %s", (source) => {
    expect(privateImports(resolve(root, "apps/api/src/app.ts"), source)).toEqual([
      "./features/content/request.ts",
    ]);
  });

  it.each([
    "./features/content/request",
    "./features/content/request.js",
    "./features/content/../content/request.ts",
    "./features/content/nested/index.ts",
  ])("rejects private API path spelling: %s", (specifier) => {
    expect(
      privateImports(resolve(root, "apps/api/src/app.ts"), `export * from '${specifier}';`),
    ).toEqual([specifier]);
  });

  it.each(["", "/", "/index", "/index.ts", "/index.js"])(
    "allows API public entry suffix %s",
    (suffix) => {
      expect(
        privateImports(
          resolve(root, "apps/api/src/app.ts"),
          `import { contentRoutes } from './features/content${suffix}';
         export * from './features/content${suffix}';
         type Routes = typeof import('./features/content${suffix}').contentRoutes;`,
        ),
      ).toEqual([]);
    },
  );

  it("allows same-feature imports, reexports, and nested type queries", () => {
    expect(
      privateImports(
        resolve(root, "apps/api/src/features/content/index.ts"),
        `import { access } from './request.ts';
         export * from './responses.ts';
         type Access = { nested: ReturnType<typeof import('./request.ts').access> };`,
      ),
    ).toEqual([]);
  });

  it("rejects access from another feature or a similarly named directory", () => {
    for (const directory of ["health", "content-extra"]) {
      expect(
        privateImports(
          resolve(root, `apps/api/src/features/${directory}/index.ts`),
          "export * from '../content/request.ts';",
        ),
      ).toEqual(["../content/request.ts"]);
    }
  });

  it("resolves createRequire loads from the API package root as well as the file", () => {
    const file = resolve(root, "apps/api/src/cli.ts");
    expect(
      privateImports(
        file,
        `const load = createRequire(resolve("package.json"));
         load("./src/features/content/request.ts");
         load("./src/app.ts");
         load("pino");`,
      ),
    ).toEqual(["./src/features/content/request.ts"]);
  });

  it("ignores ordinary string literals and package imports", () => {
    expect(
      privateImports(
        resolve(root, "apps/api/src/app.ts"),
        `const path = './features/content/request.ts';
         type Path = './features/content/request.ts';
         console.log('./features/content/request.ts');
         const pino = await import('pino');
         import { Hono } from 'hono';`,
      ),
    ).toEqual([]);
  });

  it("detects nested web type imports through aliases and relative paths", () => {
    expect(
      privateImports(
        resolve(webRoot, "components/example.tsx"),
        `type Navigation = {
           page: import('@/features/navigation/pages').Page;
           search: ReturnType<typeof import('../features/navigation/navigation').PageSearch>;
         };`,
      ),
    ).toEqual(["@/features/navigation/pages", "../features/navigation/navigation"]);
  });

  it("allows web public type imports and same-feature private type queries", () => {
    expect(
      privateImports(
        resolve(webRoot, "features/navigation/index.ts"),
        `type Shell = typeof import('@/components/shell/index.tsx').AppShell;
         type Page = import('./pages').Page;
         type Search = typeof import('@/features/navigation/navigation').PageSearch;`,
      ),
    ).toEqual([]);
  });

  it("detects aliases and relative imports that bypass navigation", () => {
    const file = resolve(webRoot, "components/example.tsx");
    expect(
      privateImports(
        file,
        "import { PageSearch } from '@/features/navigation/navigation'; export { navigationGroups } from '../features/navigation/pages';",
      ),
    ).toEqual(["@/features/navigation/navigation", "../features/navigation/pages"]);
    expect(privateImports(file, "import { PageSearch } from '@/features/navigation';")).toEqual([]);
  });

  it("protects shell internals while allowing its public interface", () => {
    const file = resolve(webRoot, "App.tsx");
    expect(
      privateImports(file, "import { AppHeader } from '@/components/shell/app-header';"),
    ).toEqual(["@/components/shell/app-header"]);
    expect(privateImports(file, "import { AppShell } from '@/components/shell';")).toEqual([]);
    expect(
      privateImports(
        resolve(webRoot, "components/shell/index.tsx"),
        "import { AppHeader } from './app-header';",
      ),
    ).toEqual([]);
  });

  it.each([
    "import { value } from '$specifier';",
    "import type { Value } from '$specifier';",
    "import '$specifier';",
    "export { value } from '$specifier';",
    "export type { Value } from '$specifier';",
    "export * from '$specifier';",
    "export * as internals from '$specifier';",
    "type Value = import('$specifier').Value;",
    "type Value = { nested: ReturnType<typeof import('$specifier').value> };",
    "async function load() { return import('$specifier'); }",
    "const value = require('$specifier');",
    "function load() { return require('$specifier'); }",
    "import value = require('$specifier');",
  ])("keeps web feature internals private for %s", (form) => {
    const source = form.replaceAll("$specifier", "@/features/navigation/pages");
    expect(privateImports(resolve(webRoot, "features/sign-in/index.ts"), source)).toEqual([
      "@/features/navigation/pages",
    ]);
    expect(privateImports(resolve(webRoot, "features/navigation/index.ts"), source)).toEqual([]);
  });

  it("ignores ordinary strings and member calls named require", () => {
    expect(
      privateImports(
        resolve(webRoot, "App.tsx"),
        `const text = "require('@/features/navigation/pages')";
         const value = object.require('@/features/navigation/pages');`,
      ),
    ).toEqual([]);
  });

  it("resolves the @/ alias only for web callers", () => {
    expect(
      privateImports(
        resolve(root, "apps/api/src/app.ts"),
        "import { PageSearch } from '@/features/navigation/navigation';",
      ),
    ).toEqual([]);
  });

  it.each(sourceRoots)("keeps module implementations private for callers in %s", (source) => {
    const violations = readdirSync(source, { recursive: true, encoding: "utf8" })
      .filter((file) => /\.tsx?$/.test(file))
      .flatMap((file) => {
        const path = resolve(source, file);
        return privateImports(path, readFileSync(path, "utf8")).map(
          (specifier) => `${file}: ${specifier}`,
        );
      });
    expect(violations).toEqual([]);
  });
});
