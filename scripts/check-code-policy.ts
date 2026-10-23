import { parse, type ParserPlugin } from "@babel/parser";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface PolicyViolation {
  line: number;
  column: number;
  rule: "ordinary-comment" | "type-suppression";
}

export function inspectCode(file: string, source: string): PolicyViolation[] {
  const plugins: ParserPlugin[] = [];
  if (/\.[cm]?tsx?$/.test(file)) plugins.push(["typescript", { dts: /\.d\.[cm]?ts$/.test(file) }]);
  if (/\.[jt]sx$/.test(file)) plugins.push("jsx");
  const ast = parse(source, { sourceType: "unambiguous", plugins });
  const documented = new Set<number>();
  const declarationParts = new Set([
    "ClassMethod", "ClassPrivateMethod", "ClassProperty", "ClassPrivateProperty",
    "ClassAccessorProperty", "ObjectMethod", "ObjectProperty", "TSPropertySignature",
    "TSMethodSignature", "TSCallSignatureDeclaration", "TSConstructSignatureDeclaration",
    "TSIndexSignature", "TSDeclareMethod",
  ]);
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (value === null || typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    if (typeof node.type === "string" && (node.type.endsWith("Declaration") || declarationParts.has(node.type)) && typeof node.start === "number" && Array.isArray(node.leadingComments)) {
      for (const leading of node.leadingComments as { start: number; end: number }[]) {
        if (source.slice(leading.end, node.start).trim() === "") documented.add(leading.start);
      }
    }
    for (const [key, child] of Object.entries(node)) {
      if (!["comments", "leadingComments", "innerComments", "trailingComments", "loc", "tokens"].includes(key)) visit(child);
    }
  };
  visit(ast.program);
  const violations: PolicyViolation[] = [];
  for (const comment of ast.comments ?? []) {
    const rule = /@ts-(?:expect-error|ignore|nocheck)\b/i.test(comment.value)
      ? "type-suppression"
      : comment.type === "CommentBlock" && comment.value.startsWith("*") && !comment.value.startsWith("**") && documented.has(comment.start!)
        ? undefined : "ordinary-comment";
    if (rule) violations.push({ line: comment.loc?.start.line ?? 1, column: (comment.loc?.start.column ?? 0) + 1, rule });
  }
  return violations;
}

export function checkCodePolicy(root = resolve(import.meta.dir, "..")): void {
  const git = Bun.spawnSync(["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    cwd: root, stdout: "pipe", stderr: "pipe",
  });
  if (!git.success) throw new Error(new TextDecoder().decode(git.stderr));
  const files = [...new Set(new TextDecoder().decode(git.stdout).split("\0"))]
    .filter((file) => /\.[cm]?[jt]sx?$/.test(file)).sort();
  let failures = 0;
  for (const file of files) {
    for (const violation of inspectCode(file, readFileSync(resolve(root, file), "utf8"))) {
      console.error(`${file}:${violation.line}:${violation.column} ${violation.rule}`);
      failures++;
    }
  }
  if (failures) throw new Error(`${failures} code policy violation(s)`);
  console.log(`Code policy passed for ${files.length} JavaScript/TypeScript files`);
}

if (import.meta.main) checkCodePolicy(process.argv[2] === undefined ? undefined : resolve(process.argv[2]));
