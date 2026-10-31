import type { Invocation, Snapshot } from "./index.ts";
export const sha = "a".repeat(40);
export const snapshot: Snapshot = {
  repositoryId: 10,
  number: 7,
  base: "b".repeat(40),
  head: sha,
  headRepositoryId: 11,
  baseRef: "main",
  author: { id: 20, login: "member", type: "User" },
  fork: true,
  files: [
    {
      path: "src/value.ts",
      sha: "c".repeat(40),
      mode: "100644",
      text: "export const value = 1;\n",
      patch: "@@ -1 +1 @@\n-export const value = 0;\n+export const value = 1;",
    },
  ],
  omitted: [],
  changedPaths: ["src/value.ts"],
  tree: "d".repeat(40),
  complete: true,
};
export const invocation: Invocation = {
  kind: "automatic",
  snapshot,
  role: "reviewer",
  control: "e".repeat(40),
};
