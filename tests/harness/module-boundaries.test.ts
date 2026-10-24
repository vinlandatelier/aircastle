import { parse } from "@babel/parser";
import { readFileSync, readdirSync } from "node:fs";
import { basename, dirname, resolve, sep } from "node:path";
import { describe, expect, it } from "vite-plus/test";

const root = resolve(import.meta.dirname, "../..");
const sourceRoot = resolve(root, "apps/web/src");
const sourceRoots = [sourceRoot, resolve(root, "apps/api/src")];
const serverPackages = ["@aircastle/core", "@aircastle/adapter-postgres", "@aircastle/cli"];
const serverRoots = [
  resolve(root, "apps/api"),
  ...serverPackages.map((name) => resolve(root, "packages", name.slice("@aircastle/".length))),
];
const modules = [
  resolve(sourceRoot, "components/shell"),
  ...sourceRoots.flatMap((source) => {
    const features = resolve(source, "features");
    return readdirSync(features, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => resolve(features, entry.name));
  }),
];

function privateImports(file: string, source: string): string[] {
  const ast = parse(source, {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
    createImportExpressions: true,
  });
  const specifiers: string[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value === null || typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    const callee = node.callee;
    const literal =
      node.type === "ImportDeclaration" ||
      node.type === "ExportNamedDeclaration" ||
      node.type === "ExportAllDeclaration" ||
      node.type === "ImportExpression"
        ? node.source
        : node.type === "TSImportType"
          ? node.argument
          : node.type === "TSExternalModuleReference"
            ? node.expression
            : node.type === "CallExpression" &&
                callee !== null &&
                typeof callee === "object" &&
                "type" in callee &&
                callee.type === "Identifier" &&
                "name" in callee &&
                callee.name === "require" &&
                Array.isArray(node.arguments)
              ? node.arguments[0]
              : undefined;
    if (
      literal !== null &&
      typeof literal === "object" &&
      "value" in literal &&
      typeof literal.value === "string"
    )
      specifiers.push(literal.value);
    Object.values(node).forEach(visit);
  };
  visit(ast.program);
  const browser = file.startsWith(`${sourceRoot}${sep}`);
  return specifiers.filter((specifier) => {
    const target =
      browser && specifier.startsWith("@/")
        ? resolve(sourceRoot, specifier.slice(2))
        : specifier.startsWith(".")
          ? resolve(dirname(file), specifier)
          : undefined;
    if (
      browser &&
      (serverPackages.some((name) => specifier === name || specifier.startsWith(`${name}/`)) ||
        (target !== undefined &&
          (serverRoots.some(
            (directory) => target === directory || target.startsWith(`${directory}${sep}`),
          ) ||
            /^aircastle\.config\.[cm]?[jt]sx?$/.test(basename(target)))))
    )
      return true;
    const owner = modules.find((module) => target?.startsWith(`${module}${sep}`));
    if (!owner || file.startsWith(`${owner}${sep}`)) return false;
    return !["index", "index.ts", "index.tsx", "index.js", "index.jsx"].some(
      (entry) => target === resolve(owner, entry),
    );
  });
}

describe("Module entry points", () => {
  const browserImportForms = [
    "import { value } from '$specifier';",
    "import type { Value } from '$specifier';",
    "import '$specifier';",
    "export { value } from '$specifier';",
    "export type { Value } from '$specifier';",
    "export * from '$specifier';",
    "export * as server from '$specifier';",
    "type Value = import('$specifier').Value;",
    "type Value = { nested: ReturnType<typeof import('$specifier').value> };",
    "async function load() { return import('$specifier'); }",
    "const value = require('$specifier');",
    "function load() { return require('$specifier'); }",
    "import value = require('$specifier');",
  ];

  describe.each([
    "@aircastle/core",
    "@aircastle/core/service",
    "@aircastle/adapter-postgres",
    "@aircastle/adapter-postgres/storage",
    "@aircastle/cli",
    "@aircastle/cli/config",
    "../../api",
    "../../api/dist/index.js",
    "../../api/src",
    "../../api/src/app.ts",
    "../../api/src/features/content/index.ts",
    "../../api/src/features/content/../content/request.ts",
    "@/../../api/src/app.ts",
    "../../../packages/core/src/index.ts",
    "../../../packages/adapter-postgres/src/index.ts",
    "@/../../../packages/cli/src/index.ts",
    "../../../aircastle.config.ts",
    "@/../../../aircastle.config.js",
    "../../../aircastle.config.mjs",
    "../../../aircastle.config.cjs",
    "../../../aircastle.config.mts",
    "../../../aircastle.config.cts",
    "../aircastle.config.tsx",
    "./aircastle.config.jsx",
    "./nested/../aircastle.config.ts",
  ])("browser server boundary for %s", (specifier) => {
    it.each(browserImportForms)("rejects %s", (form) => {
      expect(
        privateImports(resolve(sourceRoot, "App.tsx"), form.replaceAll("$specifier", specifier)),
      ).toEqual([specifier]);
    });
  });

  it.each([
    "@aircastle/contracts",
    "@aircastle/contracts/content",
    "@aircastle/schema",
    "@aircastle/client",
    "@aircastle/core-utils",
    "@aircastle/adapter-postgres-extra",
    "@aircastle/cli-ui",
    "react",
    "@base-ui/react/button",
    "../../api-extra/src/app.ts",
    "../../api/src/../../shared/index.ts",
    "../../../packages/core-extra/src/index.ts",
    "./aircastle.config.json",
    "./aircastle.config.ts.backup",
    "./aircastle.config.tsx-extra",
    "./aircastle.config.ts/index.ts",
    "./my-aircastle.config.ts",
    "@/components/shell",
    "@/features/navigation/../navigation/index.ts",
  ])("allows browser-safe dependency %s in every import form", (specifier) => {
    for (const form of browserImportForms) {
      expect(
        privateImports(resolve(sourceRoot, "App.tsx"), form.replaceAll("$specifier", specifier)),
      ).toEqual([]);
    }
  });

  it("allows server dependencies for API callers", () => {
    expect(
      privateImports(
        resolve(root, "apps/api/src/app.ts"),
        `export { createService } from '@aircastle/core';
         const adapter = import('@aircastle/adapter-postgres');
         const cli = require('@aircastle/cli');
         import config from '../../../aircastle.config.ts';`,
      ),
    ).toEqual([]);
  });

  it("rejects normalized server paths from nested browser features", () => {
    expect(
      privateImports(
        resolve(sourceRoot, "features/navigation/nested/example.ts"),
        `export * from '../../../../../api/src/app.ts';
         const config = import('../../../../../../aircastle.config.ts');
         const server = require('@/../../api/src/features/content/index.ts');`,
      ),
    ).toEqual([
      "../../../../../api/src/app.ts",
      "../../../../../../aircastle.config.ts",
      "@/../../api/src/features/content/index.ts",
    ]);
  });

  it.each(browserImportForms)("preserves browser feature privacy for %s", (form) => {
    const specifier = "@/features/navigation/pages";
    expect(
      privateImports(
        resolve(sourceRoot, "features/sign-in/index.ts"),
        form.replaceAll("$specifier", specifier),
      ),
    ).toEqual([specifier]);
    expect(
      privateImports(
        resolve(sourceRoot, "features/navigation/index.ts"),
        form.replaceAll("$specifier", specifier),
      ),
    ).toEqual([]);
  });

  it("ignores browser string literals that name server code", () => {
    expect(
      privateImports(
        resolve(sourceRoot, "App.tsx"),
        `const name = '@aircastle/core';
         type Path = '../../api/src/app.ts';
         const config = '../../../aircastle.config.ts';
         const text = "require('@aircastle/cli')";
         const value = object.require('@aircastle/core');`,
      ),
    ).toEqual([]);
  });

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

  it("detects nested web type imports through aliases and relative paths", () => {
    expect(
      privateImports(
        resolve(sourceRoot, "components/example.tsx"),
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
        resolve(sourceRoot, "features/navigation/index.ts"),
        `type Shell = typeof import('@/components/shell/index.tsx').AppShell;
         type Page = import('./pages').Page;
         type Search = typeof import('@/features/navigation/navigation').PageSearch;`,
      ),
    ).toEqual([]);
  });

  it("ignores ordinary string literals and package imports", () => {
    expect(
      privateImports(
        resolve(root, "apps/api/src/app.ts"),
        `const path = './features/content/request.ts';
         type Path = './features/content/request.ts';
         import { Hono } from 'hono';`,
      ),
    ).toEqual([]);
  });

  it("detects aliases and relative imports that bypass navigation", () => {
    const file = resolve(sourceRoot, "components/example.tsx");
    expect(
      privateImports(
        file,
        "import { PageSearch } from '@/features/navigation/navigation'; export { navigationGroups } from '../features/navigation/pages';",
      ),
    ).toEqual(["@/features/navigation/navigation", "../features/navigation/pages"]);
    expect(privateImports(file, "import { PageSearch } from '@/features/navigation';")).toEqual([]);
  });

  it("protects shell internals while allowing its public interface", () => {
    const file = resolve(sourceRoot, "App.tsx");
    expect(
      privateImports(file, "import { AppHeader } from '@/components/shell/app-header';"),
    ).toEqual(["@/components/shell/app-header"]);
    expect(privateImports(file, "import { AppShell } from '@/components/shell';")).toEqual([]);
    expect(
      privateImports(
        resolve(sourceRoot, "components/shell/index.tsx"),
        "import { AppHeader } from './app-header';",
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
