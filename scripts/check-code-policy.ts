import { parse, type ParserPlugin } from "@babel/parser";
import { readFileSync } from "node:fs";
import { posix, resolve } from "node:path";

interface Position {
  line: number;
  column: number;
}

export interface PolicyViolation extends Position {
  rule:
    | "ordinary-comment"
    | "type-suppression"
    | "cross-workspace-relative-import"
    | "web-alias-escape"
    | "undeclared-workspace-import"
    | "swallowed-error"
    | "stale-catch-allowance";
}

/** A parsed Babel node, read through its `type` discriminant and runtime-checked fields. */
interface SyntaxNode {
  readonly type: string;
  readonly [field: string]: unknown;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function isSyntaxNode(value: unknown): value is SyntaxNode {
  return isRecord(value) && typeof value.type === "string";
}

function nodeAt(node: SyntaxNode | undefined, field: string): SyntaxNode | undefined {
  const value = node?.[field];
  return isSyntaxNode(value) ? value : undefined;
}

function listAt(node: SyntaxNode | undefined, field: string): readonly unknown[] {
  const value = node?.[field];
  return Array.isArray(value) ? value : [];
}

function textAt(node: SyntaxNode | undefined, field: string): string | undefined {
  const value = node?.[field];
  return typeof value === "string" ? value : undefined;
}

/** The node's one-based source position, or line 1 column 1 when the parser gave none. */
function positionOf(node: SyntaxNode): Position {
  const start = isRecord(node.loc) ? node.loc.start : undefined;
  const line = isRecord(start) ? start.line : undefined;
  const column = isRecord(start) ? start.column : undefined;
  return {
    line: typeof line === "number" ? line : 1,
    column: (typeof column === "number" ? column : 0) + 1,
  };
}

const workspaceSource = /^(?:packages|apps)\/[^/]+\/src\//;

/** Catch clauses that deliberately map every failure to one outcome, as the exact count per file. */
const deliberateCatchAllowances: Readonly<Record<string, { count: number; reason: string }>> = {
  "apps/api/src/index.ts": {
    count: 1,
    reason: "Shutdown reports any close failure as exit code 1.",
  },
  "apps/api/src/features/content/request.ts": {
    count: 2,
    reason:
      "A failed request body stream is an invalid request, and cancelling an oversized body is best effort before payload_too_large.",
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

function bindingNames(node: unknown): string[] {
  if (!isSyntaxNode(node)) return [];
  if (node.type === "Identifier") {
    const name = textAt(node, "name");
    return name === undefined ? [] : [name];
  }
  if (node.type === "ObjectPattern")
    return listAt(node, "properties").flatMap((entry) =>
      isSyntaxNode(entry)
        ? bindingNames(entry.type === "RestElement" ? entry.argument : entry.value)
        : [],
    );
  if (node.type === "ArrayPattern") return listAt(node, "elements").flatMap(bindingNames);
  if (node.type === "AssignmentPattern") return bindingNames(node.left);
  if (node.type === "RestElement") return bindingNames(node.argument);
  return [];
}

const unvisitedKeys = new Set(["loc", "leadingComments", "innerComments", "trailingComments"]);

/** Whether code reads one of the names, ignoring property keys and reads that only discard the value. */
function readsAny(value: unknown, names: ReadonlySet<string>): boolean {
  if (Array.isArray(value)) return value.some((entry) => readsAny(entry, names));
  if (!isRecord(value)) return false;
  const node = isSyntaxNode(value) ? value : undefined;
  if (node?.type === "Identifier") {
    const name = textAt(node, "name");
    return name !== undefined && names.has(name);
  }
  if (node?.type === "ExpressionStatement" && nodeAt(node, "expression")?.type === "Identifier")
    return false;
  if (node?.type === "UnaryExpression" && node.operator === "void") return false;
  return Object.entries(value).some(([key, child]) => {
    if (unvisitedKeys.has(key)) return false;
    if (
      key === "property" &&
      (node?.type === "MemberExpression" || node?.type === "OptionalMemberExpression") &&
      !node.computed
    )
      return false;
    if (key === "key" && !node?.computed) return false;
    return readsAny(child, names);
  });
}

const rejectionArguments = new Map([
  ["catch", 0],
  ["then", 1],
]);

function rejectionHandler(node: SyntaxNode): SyntaxNode | undefined {
  if (node.type !== "CallExpression" && node.type !== "OptionalCallExpression") return undefined;
  const callee = nodeAt(node, "callee");
  const property = nodeAt(callee, "property");
  const name =
    (callee?.type === "MemberExpression" || callee?.type === "OptionalMemberExpression") &&
    !callee.computed &&
    property?.type === "Identifier"
      ? textAt(property, "name")
      : undefined;
  const position = name === undefined ? undefined : rejectionArguments.get(name);
  if (position === undefined) return undefined;
  const handler = listAt(node, "arguments")[position];
  return isSyntaxNode(handler) &&
    (handler.type === "ArrowFunctionExpression" || handler.type === "FunctionExpression")
    ? handler
    : undefined;
}

/** Whether a catch clause or an inline promise rejection handler discards the error it receives. */
function swallowsError(node: SyntaxNode): boolean {
  const handler = rejectionHandler(node);
  const [param, body] =
    node.type === "CatchClause"
      ? [node.param, node.body]
      : handler
        ? [listAt(handler, "params")[0], handler.body]
        : [];
  if (body === undefined) return false;
  const names = new Set(bindingNames(param));
  return names.size === 0 || !readsAny(body, names);
}

/** A package in the repository, where the root package has the directory "". */
export interface Workspace {
  directory: string;
  /** Absent when the package manifest has no `name`. */
  name: string | undefined;
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

function dynamicImportArgument(node: SyntaxNode): SyntaxNode | undefined {
  if (node.type !== "CallExpression" || nodeAt(node, "callee")?.type !== "Import") return undefined;
  const argument = listAt(node, "arguments")[0];
  return isSyntaxNode(argument) ? argument : undefined;
}

function moduleSpecifier(node: SyntaxNode): { value: string; position: Position } | undefined {
  const key = moduleSpecifierKeys[node.type];
  const candidate = key === undefined ? dynamicImportArgument(node) : nodeAt(node, key);
  const literal = candidate?.type === "TSLiteralType" ? nodeAt(candidate, "literal") : candidate;
  if (literal === undefined) return undefined;
  const value = literal.type === "StringLiteral" ? textAt(literal, "value") : templateText(literal);
  return value === undefined ? undefined : { value, position: positionOf(literal) };
}

function templateText(literal: SyntaxNode): string | undefined {
  const { expressions } = literal;
  if (literal.type !== "TemplateLiteral" || !Array.isArray(expressions) || expressions.length !== 0)
    return undefined;
  const quasi = listAt(literal, "quasis")[0];
  const text = isSyntaxNode(quasi) ? quasi.value : undefined;
  const cooked = isRecord(text) ? text.cooked : undefined;
  return typeof cooked === "string" ? cooked : undefined;
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
  const byName = new Map(
    workspaces.flatMap((workspace) =>
      workspace.name === undefined ? [] : [[workspace.name, workspace] as const],
    ),
  );
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
  for (const name of byName.keys()) visit(name);
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
  const inspectNode = (node: SyntaxNode): void => {
    if (workspaceSource.test(file) && swallowsError(node))
      swallowed.push({ ...positionOf(node), rule: "swallowed-error" });
    const specifier = moduleSpecifier(node);
    const boundary = specifier && inspectSpecifier(file, specifier.value, workspaces);
    if (boundary) violations.push({ ...specifier.position, rule: boundary });
    const { start } = node;
    if (
      (node.type.endsWith("Declaration") || declarationParts.has(node.type)) &&
      typeof start === "number"
    ) {
      for (const leading of listAt(node, "leadingComments")) {
        if (
          isSyntaxNode(leading) &&
          typeof leading.start === "number" &&
          typeof leading.end === "number" &&
          source.slice(leading.end, start).trim() === ""
        )
          documented.add(leading.start);
      }
    }
  };
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;
    if (isSyntaxNode(value)) inspectNode(value);
    for (const [key, child] of Object.entries(value)) {
      if (!unvisitedKeys.has(key)) visit(child);
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

interface Manifest {
  name: string | undefined;
  workspaces: string[];
  dependencies: string[];
}

function readManifest(path: string): Manifest {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  const fields = isRecord(parsed) ? parsed : {};
  const { name, workspaces = [] } = fields;
  if (!Array.isArray(workspaces) || !workspaces.every((pattern) => typeof pattern === "string"))
    throw new Error(`${path} "workspaces" must be a list of strings`);
  return {
    name: typeof name === "string" ? name : undefined,
    workspaces,
    dependencies: dependencyFields.flatMap((field) => {
      const dependencies = fields[field];
      return isRecord(dependencies) ? Object.keys(dependencies) : [];
    }),
  };
}

function readWorkspaces(root: string, files: readonly string[]): Workspace[] {
  if (!files.includes("package.json")) return [];
  const manifest = (directory: string) => readManifest(resolve(root, directory, "package.json"));
  const globs = manifest("").workspaces.map((pattern) => new Bun.Glob(pattern));
  const directories = files
    .filter((file) => file.endsWith("/package.json"))
    .map((file) => posix.dirname(file))
    .filter((directory) => globs.some((glob) => glob.match(directory)));
  return ["", ...directories].map((directory) => {
    const { name, dependencies } = manifest(directory);
    return { directory, name, dependencies };
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
