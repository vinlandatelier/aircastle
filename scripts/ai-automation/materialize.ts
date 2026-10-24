import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { controlPath, safePath, type Edit, type Fix, type Snapshot } from "./index.ts";

export async function applyEdits(root: string, edits: Edit[]): Promise<void> {
  for (const edit of edits) {
    const path = safePath(edit.path);
    if (controlPath(path)) throw new Error("Protected edit path");
    const parts = path.split("/");
    for (let i = 1; i <= parts.length; i++) {
      const file = join(root, ...parts.slice(0, i));
      const stat = await lstat(file).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      if (
        stat?.isSymbolicLink() ||
        (i < parts.length && stat && !stat.isDirectory()) ||
        (i === parts.length && stat && !stat.isFile())
      )
        throw new Error("Symlink or nonregular edit path");
    }
    const target = join(root, path);
    const original = await readFile(target).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    const blob =
      original === null
        ? null
        : createHash("sha1").update(`blob ${original.length}\0`).update(original).digest("hex");
    if (blob !== edit.expectedBlob || original?.includes(0))
      throw new Error("Original blob precondition failed");
  }
  for (const edit of edits) {
    const target = join(root, edit.path);
    if (edit.content === null) await unlink(target);
    else {
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, edit.content, { flag: edit.expectedBlob === null ? "wx" : "w" });
    }
  }
}

export function renderPatch(fix: Fix, snapshot: Snapshot): string {
  const lines = (source: string | null, prefix: string): string[] => {
    if (!source) return [];
    const trailing = source.endsWith("\n");
    const result = (trailing ? source.slice(0, -1) : source)
      .split("\n")
      .map((line) => prefix + line);
    if (!trailing) result.push("\\ No newline at end of file");
    return result;
  };
  const count = (source: string | null): number =>
    source ? source.split("\n").length - Number(source.endsWith("\n")) : 0;
  return fix.edits
    .map((edit) => {
      const original = snapshot.files.find((file) => file.path === edit.path)!;
      const before = original.text,
        after = edit.content;
      const a = JSON.stringify(`a/${edit.path}`),
        b = JSON.stringify(`b/${edit.path}`);
      const removed = count(before),
        added = count(after);
      return [
        `diff --git ${a} ${b}`,
        ...(original.sha === null
          ? [`new file mode ${original.mode}`]
          : after === null
            ? [`deleted file mode ${original.mode}`]
            : []),
        ...(removed || added
          ? [
              `--- ${original.sha === null ? "/dev/null" : a}`,
              `+++ ${after === null ? "/dev/null" : b}`,
              `@@ -${removed ? 1 : 0},${removed} +${added ? 1 : 0},${added} @@`,
              ...lines(before, "-"),
              ...lines(after, "+"),
            ]
          : []),
        "",
      ].join("\n");
    })
    .join("\n");
}
