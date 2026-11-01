import { parse, type ParserPlugin } from "@babel/parser";
import { readFileSync } from "node:fs";
import { posix, resolve } from "node:path";

export interface PolicyViolation {
  line: number;
  column: number;
  rule:
    | "ordinary-comment"
    | "type-suppression"
    | "cross-workspace-relative-import"
    | "web-alias-escape"
    | "undeclared-workspace-import"
    | "swallowed-error"
    | "stale-catch-allowance";
}

interface SyntaxKey {
  type: string;
  name?: string;
  value?: unknown;
  expressions?: unknown[];
  quasis?: { value: { cooked?: string | null } }[];
  loc?: { start: { line: number; column: number } };
}

const workspaceSource = /^(?:packages|apps)\/[^/]+\/src\//;

/** Catch clauses that deliberately map every failure to one outcome, as the exact count per file. */
const deliberateCatchAllowances: Readonly<Record<string, { count: number; reason: string }>> = {
  "apps/api/src/index.ts": {
    count: 1,
    reason: "Shutdown reports any close failure as exit code 1.",
  },
  "apps/api/src/features/auth/credentials.ts": {
    count: 3,
    reason:
      "Any inbox preparation failure is a delivery failure that keeps the previous link, and an unresolved issuance lookup reports storage-unavailable or schedules another reconciliation.",
  },
  "apps/api/src/features/auth/request.ts": {
    count: 1,
    reason: "An unreadable or malformed auth request body is treated as missing input.",
  },
  "apps/api/src/features/auth/runtime.ts": {
    count: 4,
    reason:
      "Confirmation, session, sign-out and preview failures report temporary-failure (503) and emit storage-unavailable without exposing details.",
  },
  "apps/api/src/features/content/request.ts": {
    count: 2,
    reason:
      "A failed request body stream is an invalid request, and cancelling an oversized body is best effort before payload_too_large.",
  },
  "apps/web/src/features/auth/http.ts": {
    count: 1,
    reason: "Any transport or response-body failure is shown as a temporary failure.",
  },
  "packages/core/src/index.ts": {
    count: 1,
    reason:
      "Pending-operation tracking only untracks a rejected operation; its caller still receives the rejection.",
  },
  "packages/cli/src/index.ts": {
    count: 2,
    reason:
      "Lockfile cleanup ignores a temporary file that is already gone or can't be removed, and a schema exchange reports any fetch or response-body failure as transport_error, or unknown_write_outcome for a write.",
  },
  "packages/client/src/index.ts": {
    count: 1,
    reason:
      "A document request reports any fetch or response-body failure as one transport or unknown-write result.",
  },
  "packages/client/src/test-support/native-transport.ts": {
    count: 1,
    reason: "The probe measures whether native fetch rejects a reset connection at all.",
  },
};

function bindingNames(pattern: unknown): string[] {
  if (pattern === null || typeof pattern !== "object") return [];
  const node = pattern as Record<string, unknown>;
  if (node.type === "Identifier") return [node.name as string];
  if (node.type === "ObjectPattern")
    return (node.properties as Record<string, unknown>[]).flatMap((entry) =>
      bindingNames(entry.type === "RestElement" ? entry.argument : entry.value),
    );
  if (node.type === "ArrayPattern") return (node.elements as unknown[]).flatMap(bindingNames);
  if (node.type === "AssignmentPattern") return bindingNames(node.left);
  if (node.type === "RestElement") return bindingNames(node.argument);
  return [];
}

/** Whether code reads one of the names, ignoring property keys and reads that only discard the value. */
function readsAny(value: unknown, names: ReadonlySet<string>): boolean {
  if (Array.isArray(value)) return value.some((entry) => readsAny(entry, names));
  if (value === null || typeof value !== "object") return false;
  const node = value as Record<string, unknown>;
  if (node.type === "Identifier") return names.has(node.name as string);
  if (node.type === "ExpressionStatement" && (node.expression as SyntaxKey).type === "Identifier")
    return false;
  if (node.type === "UnaryExpression" && node.operator === "void") return false;
  return Object.entries(node).some(([key, child]) => {
    if (["loc", "leadingComments", "innerComments", "trailingComments"].includes(key)) return false;
    if (
      key === "property" &&
      (node.type === "MemberExpression" || node.type === "OptionalMemberExpression") &&
      !node.computed
    )
      return false;
    if (key === "key" && !node.computed) return false;
    return readsAny(child, names);
  });
}

const rejectionArguments = new Map([
  ["catch", 0],
  ["then", 1],
]);

function rejectionHandler(node: Record<string, unknown>): Record<string, unknown> | undefined {
  if (node.type !== "CallExpression" && node.type !== "OptionalCallExpression") return undefined;
  const callee = node.callee as Record<string, unknown>;
  const property = callee.property as SyntaxKey | undefined;
  const position =
    (callee.type === "MemberExpression" || callee.type === "OptionalMemberExpression") &&
    !callee.computed &&
    property?.type === "Identifier"
      ? rejectionArguments.get(property.name as string)
      : undefined;
  if (position === undefined) return undefined;
  const handler = (node.arguments as Record<string, unknown>[])[position];
  return handler?.type === "ArrowFunctionExpression" || handler?.type === "FunctionExpression"
    ? handler
    : undefined;
}

/** Whether a catch clause or an inline promise rejection handler discards the error it receives. */
function swallowsError(node: Record<string, unknown>): boolean {
  const handler = rejectionHandler(node);
  const [param, body] =
    node.type === "CatchClause"
      ? [node.param, node.body]
      : handler
        ? [(handler.params as unknown[])[0], handler.body]
        : [];
  if (body === undefined) return false;
  const names = new Set(bindingNames(param));
  return names.size === 0 || !readsAny(body, names);
}

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

const webAliasRoot = "apps/web/src";

function inspectSpecifier(
  file: string,
  specifier: string,
  workspaces: readonly Workspace[],
): PolicyViolation["rule"] | undefined {
  if (file.startsWith("apps/web/") && (specifier === "@" || specifier.startsWith("@/"))) {
    const target = posix.normalize(posix.join(webAliasRoot, specifier.slice(1)));
    return target === webAliasRoot || target.startsWith(`${webAliasRoot}/`)
      ? undefined
      : "web-alias-escape";
  }
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
  const swallowed: PolicyViolation[] = [];
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
    if (workspaceSource.test(file) && swallowsError(node)) {
      const start = (node.loc as SyntaxKey["loc"])?.start;
      swallowed.push({
        line: start?.line ?? 1,
        column: (start?.column ?? 0) + 1,
        rule: "swallowed-error",
      });
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
  const allowance = Object.hasOwn(deliberateCatchAllowances, file)
    ? deliberateCatchAllowances[file]!.count
    : 0;
  if (swallowed.length !== allowance)
    violations.push(
      ...(swallowed.length > allowance
        ? swallowed.slice(allowance)
        : [{ line: 1, column: 1, rule: "stale-catch-allowance" as const }]),
    );
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
