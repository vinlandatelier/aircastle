import type { CodeLanguage, IssuePath, SchemaIssue, TextEditorDescription } from "./contract.ts";
import type { Modifier } from "./declarations.ts";
import { schemaIssue } from "./errors.ts";
import { receivedType } from "./records.ts";

const languages: readonly CodeLanguage[] = [
  "plaintext",
  "javascript",
  "typescript",
  "json",
  "html",
  "css",
  "markdown",
  "sql",
];
type EditorModifier = Extract<Modifier, { kind: "editor" }>;
type EditorResult =
  | { ok: true; editor: TextEditorDescription }
  | { ok: false; issues: SchemaIssue[] };

export function equalEditor(left: TextEditorDescription, right: TextEditorDescription): boolean {
  if (left.type === "textarea") return right.type === "textarea" && left.rows === right.rows;
  if (left.type === "code") return right.type === "code" && left.language === right.language;
  return right.type === "radio";
}

export function normalizeEditor(modifier: EditorModifier, path: IssuePath): EditorResult {
  const name = modifier.name;
  if (typeof name !== "string")
    return {
      ok: false,
      issues: [
        schemaIssue(path, {
          code: "invalid_editor",
          expected: "string",
          received: receivedType(name),
        }),
      ],
    };
  if (name !== "textarea" && name !== "code" && name !== "radio")
    return { ok: false, issues: [schemaIssue(path, { code: "unknown_editor", editor: name })] };
  if (modifier.options && !modifier.options.ok)
    return {
      ok: false,
      issues: [
        schemaIssue(path, {
          code: "invalid_editor_options",
          option: "options",
          reason: "invalid_value",
        }),
      ],
    };
  const options = new Map(modifier.options?.ok ? modifier.options.entries : []);
  const issues: SchemaIssue[] = [];
  for (const [option] of options) {
    if ((name === "textarea" && option === "rows") || (name === "code" && option === "language"))
      continue;
    issues.push(
      schemaIssue(path, { code: "invalid_editor_options", option, reason: "unknown_option" }),
    );
  }
  if (name === "textarea") {
    const rows = options.has("rows") ? options.get("rows") : 4;
    if (typeof rows !== "number" || !Number.isInteger(rows) || rows <= 0)
      issues.push(
        schemaIssue(path, {
          code: "invalid_editor_options",
          option: "rows",
          reason: "invalid_value",
        }),
      );
    return issues.length
      ? { ok: false, issues }
      : { ok: true, editor: { type: "textarea", rows: rows as number } };
  }
  if (name === "code") {
    const language = options.has("language") ? options.get("language") : "plaintext";
    if (!languages.some((allowed) => allowed === language))
      issues.push(
        schemaIssue(path, {
          code: "invalid_editor_options",
          option: "language",
          reason: "invalid_value",
        }),
      );
    return issues.length
      ? { ok: false, issues }
      : { ok: true, editor: { type: "code", language: language as CodeLanguage } };
  }
  return issues.length ? { ok: false, issues } : { ok: true, editor: { type: "radio" } };
}
