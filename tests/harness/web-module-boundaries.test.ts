import { parse } from "@babel/parser";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { describe, expect, it } from "vite-plus/test";

const root = resolve(import.meta.dirname, "../..");
const sourceRoot = resolve(root, "apps/web/src");
const navigation = resolve(sourceRoot, "navigation");
const publicEntries = new Set([
  navigation,
  resolve(navigation, "index"),
  resolve(navigation, "index.ts"),
]);

function privateImports(file: string, source: string): string[] {
  if (file.startsWith(`${navigation}${sep}`)) return [];
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
    return target?.startsWith(`${navigation}${sep}`) && !publicEntries.has(target)
      ? [specifier]
      : [];
  });
}

describe("Web module entry points", () => {
  it("detects aliases and relative imports that bypass navigation", () => {
    const file = resolve(sourceRoot, "components/example.tsx");
    expect(
      privateImports(
        file,
        "import { PageSearch } from '@/navigation/navigation'; export { navigationGroups } from '../navigation/pages';",
      ),
    ).toEqual(["@/navigation/navigation", "../navigation/pages"]);
    expect(privateImports(file, "import { PageSearch } from '@/navigation';")).toEqual([]);
  });

  it("keeps navigation implementation private to the module", () => {
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
