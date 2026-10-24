import { parse } from "@babel/parser";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { describe, expect, it } from "vite-plus/test";

const root = resolve(import.meta.dirname, "../..");
const sourceRoot = resolve(root, "apps/web/src");
const features = resolve(sourceRoot, "features");
const modules = [
  resolve(sourceRoot, "components/shell"),
  ...readdirSync(features, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => resolve(features, entry.name)),
];

function privateImports(file: string, source: string): string[] {
  const ast = parse(source, { sourceType: "module", plugins: ["typescript", "jsx"] });
  return ast.program.body.flatMap((node) => {
    if (
      (node.type !== "ImportDeclaration" &&
        node.type !== "ExportNamedDeclaration" &&
        node.type !== "ExportAllDeclaration") ||
      !node.source
    )
      return [];
    const specifier = node.source.value;
    const target = specifier.startsWith("@/")
      ? resolve(sourceRoot, specifier.slice(2))
      : specifier.startsWith(".")
        ? resolve(dirname(file), specifier)
        : undefined;
    const owner = modules.find((module) => target?.startsWith(`${module}${sep}`));
    if (!owner || file.startsWith(`${owner}${sep}`)) return [];
    return ["index", "index.ts", "index.tsx"].some((entry) => target === resolve(owner, entry))
      ? []
      : [specifier];
  });
}

describe("Web module entry points", () => {
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

  it("keeps module implementations private", () => {
    const violations = readdirSync(sourceRoot, { recursive: true, encoding: "utf8" })
      .filter((file) => /\.tsx?$/.test(file))
      .flatMap((file) => {
        const path = resolve(sourceRoot, file);
        return privateImports(path, readFileSync(path, "utf8")).map(
          (specifier) => `${file}: ${specifier}`,
        );
      });
    expect(violations).toEqual([]);
  });
});
