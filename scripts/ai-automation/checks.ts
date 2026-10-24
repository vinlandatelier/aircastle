import type { Edit } from "./index.ts";

const uiTests = new Map([
  ["apps/web/src/components/ui/input-group.tsx", "src/components/ui/input-group.test.tsx"],
  ["apps/web/src/components/ui/sidebar.tsx", "src/components/ui/sidebar.test.tsx"],
  ["apps/web/src/components/ui/sidebar-state.ts", "src/components/ui/sidebar.test.tsx"],
]);

export function verificationPlan(edits: Edit[]): string[][] | null {
  if (edits.length === 0) return null;
  const tests = new Set<string>();
  for (const { path } of edits) {
    if (
      !path.split("/").every((part) => /^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*$/.test(part)) ||
      !/\.tsx?$/.test(path) ||
      /\.(?:test|spec)\.tsx?$/.test(path)
    )
      return null;
    const feature = /^apps\/web\/src\/features\/(sign-in|navigation|error-recovery)\//.exec(path);
    const behavior = feature
      ? `src/features/${feature[1]}/index.test.tsx`
      : path.startsWith("apps/web/src/components/shell/")
        ? "src/components/shell/index.test.tsx"
        : uiTests.get(path);
    if (!behavior) return null;
    tests.add(behavior);
  }
  const files = [
    ...new Set(edits.filter((edit) => edit.content !== null).map((edit) => edit.path)),
  ].sort();
  return [
    ["bun", "install", "--frozen-lockfile", "--ignore-scripts"],
    ...(files.length ? [["vp", "lint", ...files]] : []),
    [
      "vp",
      "-C",
      "apps/web",
      "run",
      "test",
      ...[...tests].sort(),
      "--allowOnly=false",
      "--passWithNoTests=false",
    ],
  ];
}
