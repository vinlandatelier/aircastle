import { parse, type ParserPlugin } from "@babel/parser";
import { readFileSync } from "node:fs";
import { posix, resolve } from "node:path";

export interface PolicyViolation {
  line: number;
  column: number;
  rule:
    | "ordinary-comment"
    | "type-suppression"
    | "unsafe-sql"
    | "cross-workspace-relative-import"
    | "undeclared-workspace-import";
}

const rawSqlFiles = new Set([
  "packages/adapter-postgres/src/identifier.ts",
  "packages/adapter-postgres/src/test-support/database.ts",
]);

interface SyntaxKey {
  type: string;
  name?: string;
  value?: unknown;
  expressions?: unknown[];
  quasis?: { value: { cooked?: string | null } }[];
  loc?: { start: { line: number; column: number } };
}

const namesUnsafe = (key: SyntaxKey, computed: boolean) =>
  (key.type === "Identifier" && key.name === "unsafe" && !computed) ||
  (key.type === "StringLiteral" && key.value === "unsafe") ||
  (key.type === "TemplateLiteral" &&
    key.expressions?.length === 0 &&
    key.quasis?.[0]?.value.cooked === "unsafe");

/** A package in the repository, where the root package has the directory "". */
export interface Workspace {
  directory: string;
  name: string;
  dependencies: readonly string[];
}

const moduleSpecifierKeys: Record<string, string> = {
  ImportDeclaration: "source",
  ExportNamedDeclaration: "source",
  ExportAllDeclaration: "source",
  ImportExpression: "source",
  TSImportType: "argument",
  TSExternalModuleReference: "expression",
};

function moduleSpecifier(node: Record<string, unknown>): SyntaxKey | undefined {
  const key = moduleSpecifierKeys[node.type as string];
  const candidate = (
    key !== undefined
      ? node[key]
      : node.type === "CallExpression" && (node.callee as SyntaxKey | undefined)?.type === "Import"
        ? (node.arguments as unknown[])[0]
        : undefined
  ) as SyntaxKey | undefined;
  const literal =
    candidate?.type === "TSLiteralType"
      ? (candidate as unknown as { literal: SyntaxKey }).literal
      : candidate;
  if (literal?.type === "StringLiteral") return literal;
  if (literal?.type !== "TemplateLiteral" || literal.expressions?.length !== 0) return undefined;
  const cooked = literal.quasis?.[0]?.value.cooked;
  return typeof cooked === "string" ? { ...literal, value: cooked } : undefined;
}

function owner(path: string, workspaces: readonly Workspace[]): Workspace | undefined {
  return workspaces
    .filter(
      (workspace) =>
        workspace.directory === "" ||
        path === workspace.directory ||
        path.startsWith(`${workspace.directory}/`),
    )
    .sort((left, right) => right.directory.length - left.directory.length)[0];
}

function inspectSpecifier(
  file: string,
  specifier: string,
  workspaces: readonly Workspace[],
): PolicyViolation["rule"] | undefined {
  const importer = owner(file, workspaces);
  if (importer === undefined) return undefined;
  if (specifier === "." || specifier === ".." || /^\.\.?\//.test(specifier)) {
    const target = posix.normalize(posix.join(posix.dirname(file), specifier));
    return target.startsWith("../") || owner(target, workspaces) !== importer
      ? "cross-workspace-relative-import"
      : undefined;
  }
  const name = specifier.split("/", specifier.startsWith("@") ? 2 : 1).join("/");
  return name !== importer.name &&
    !importer.dependencies.includes(name) &&
    workspaces.some((workspace) => workspace.name === name)
    ? "undeclared-workspace-import"
    : undefined;
}

/** Lists each dependency cycle between workspace packages as the package names along it. */
export function workspaceCycles(workspaces: readonly Workspace[]): string[][] {
  const byName = new Map(workspaces.map((workspace) => [workspace.name, workspace]));
  const finished = new Set<string>();
  const path: string[] = [];
  const cycles: string[][] = [];
  const visit = (name: string): void => {
    const start = path.indexOf(name);
    if (start !== -1) {
      cycles.push([...path.slice(start), name]);
      return;
    }
    if (finished.has(name)) return;
    path.push(name);
    for (const dependency of byName.get(name)?.dependencies ?? [])
      if (byName.has(dependency)) visit(dependency);
    path.pop();
    finished.add(name);
  };
  for (const workspace of workspaces) visit(workspace.name);
  return cycles;
}

export function inspectCode(
  file: string,
  source: string,
  workspaces: readonly Workspace[] = [],
): PolicyViolation[] {
  const plugins: ParserPlugin[] = [];
  if (/\.[cm]?tsx?$/.test(file)) plugins.push(["typescript", { dts: /\.d\.[cm]?ts$/.test(file) }]);
  if (/\.[jt]sx$/.test(file)) plugins.push("jsx");
  const ast = parse(source, { sourceType: "unambiguous", plugins });
  const documented = new Set<number>();
  const violations: PolicyViolation[] = [];
  const declarationParts = new Set([
    "ClassMethod",
    "ClassPrivateMethod",
    "ClassProperty",
    "ClassPrivateProperty",
    "ClassAccessorProperty",
    "ObjectMethod",
    "ObjectProperty",
    "TSPropertySignature",
    "TSMethodSignature",
    "TSCallSignatureDeclaration",
    "TSConstructSignatureDeclaration",
    "TSIndexSignature",
    "TSDeclareMethod",
  ]);
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value === null || typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    const keys =
      node.type === "MemberExpression" || node.type === "OptionalMemberExpression"
        ? [{ key: node.property, computed: node.computed }]
        : node.type === "ObjectPattern" && Array.isArray(node.properties)
          ? (node.properties as Record<string, unknown>[])
              .filter((entry) => entry.type === "ObjectProperty")
              .map((entry) => ({ key: entry.key, computed: entry.computed }))
          : [];
    for (const { key, computed } of keys) {
      if (!rawSqlFiles.has(file) && namesUnsafe(key as SyntaxKey, computed === true)) {
        const start = (key as SyntaxKey).loc?.start;
        violations.push({
          line: start?.line ?? 1,
          column: (start?.column ?? 0) + 1,
          rule: "unsafe-sql",
        });
      }
    }
    const specifier = moduleSpecifier(node);
    const boundary = specifier && inspectSpecifier(file, specifier.value as string, workspaces);
    if (boundary)
      violations.push({
        line: specifier.loc?.start.line ?? 1,
        column: (specifier.loc?.start.column ?? 0) + 1,
        rule: boundary,
      });
    if (
      typeof node.type === "string" &&
      (node.type.endsWith("Declaration") || declarationParts.has(node.type)) &&
      typeof node.start === "number" &&
      Array.isArray(node.leadingComments)
    ) {
      for (const leading of node.leadingComments as { start: number; end: number }[]) {
        if (source.slice(leading.end, node.start).trim() === "") documented.add(leading.start);
      }
    }
    for (const [key, child] of Object.entries(node)) {
      if (
        ![
          "comments",
          "leadingComments",
          "innerComments",
          "trailingComments",
          "loc",
          "tokens",
        ].includes(key)
      )
        visit(child);
    }
  };
  visit(ast.program);
  for (const comment of ast.comments ?? []) {
    const rule = /@ts-(?:expect-error|ignore|nocheck)\b/i.test(comment.value)
      ? "type-suppression"
      : comment.type === "CommentBlock" &&
          comment.value.startsWith("*") &&
          !comment.value.startsWith("**") &&
          documented.has(comment.start!)
        ? undefined
        : "ordinary-comment";
    if (rule)
      violations.push({
        line: comment.loc?.start.line ?? 1,
        column: (comment.loc?.start.column ?? 0) + 1,
        rule,
      });
  }
  return violations;
}

const dependencyFields = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

type Manifest = { name: string; workspaces?: string[] } & Partial<
  Record<(typeof dependencyFields)[number], Record<string, string>>
>;

function readWorkspaces(root: string, files: readonly string[]): Workspace[] {
  if (!files.includes("package.json")) return [];
  const manifest = (directory: string) =>
    JSON.parse(readFileSync(resolve(root, directory, "package.json"), "utf8")) as Manifest;
  const globs = (manifest("").workspaces ?? []).map((pattern) => new Bun.Glob(pattern));
  const directories = files
    .filter((file) => file.endsWith("/package.json"))
    .map((file) => posix.dirname(file))
    .filter((directory) => globs.some((glob) => glob.match(directory)));
  return ["", ...directories].map((directory) => {
    const { name, ...fields } = manifest(directory);
    return {
      directory,
      name,
      dependencies: dependencyFields.flatMap((field) => Object.keys(fields[field] ?? {})),
    };
  });
}

export function checkCodePolicy(root = resolve(import.meta.dirname, "..")): void {
  const git = Bun.spawnSync(
    ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  if (!git.success) throw new Error(new TextDecoder().decode(git.stderr));
  const tracked = [...new Set(new TextDecoder().decode(git.stdout).split("\0"))].sort();
  const files = tracked.filter(
    (file) => /\.[cm]?[jt]sx?$/.test(file) && !file.startsWith(".agents/skills/shadcn/"),
  );
  const workspaces = readWorkspaces(root, tracked);
  let failures = 0;
  for (const cycle of workspaceCycles(workspaces)) {
    console.error(`workspace-cycle ${cycle.join(" -> ")}`);
    failures++;
  }
  for (const file of files) {
    for (const violation of inspectCode(
      file,
      readFileSync(resolve(root, file), "utf8"),
      workspaces,
    )) {
      console.error(`${file}:${violation.line}:${violation.column} ${violation.rule}`);
      failures++;
    }
  }
  if (failures) throw new Error(`${failures} code policy violation(s)`);
  console.log(`Code policy passed for ${files.length} JavaScript/TypeScript files`);
}

if (import.meta.main)
  checkCodePolicy(process.argv[2] === undefined ? undefined : resolve(process.argv[2]));
