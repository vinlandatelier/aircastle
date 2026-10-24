import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { controlPath, safePath, type Edit } from "./index.ts";

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
