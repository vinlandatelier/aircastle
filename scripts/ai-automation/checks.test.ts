import { readFileSync } from "node:fs";
import { expect, test, vi } from "vite-plus/test";
import { verificationPlan } from "./checks.ts";
import { digest, type Edit, type Job } from "./index.ts";
import { snapshot } from "./fixtures.ts";
import { verify } from "./verify.ts";

const docker = vi.hoisted(() => ({ calls: [] as string[][] }));
vi.mock("node:child_process", () => ({
  spawnSync: (_command: string, args: string[]) => {
    docker.calls.push(args);
    return { status: 0 };
  },
}));
const install = ["bun", "install", "--frozen-lockfile", "--ignore-scripts"];
const edit = (path: string): Edit => ({ path, expectedBlob: "c".repeat(40), content: "fixed\n" });
const selectedTests = (...paths: string[]): string[] => [
  "vp",
  "-C",
  "apps/web",
  "run",
  "test",
  ...paths,
  "--allowOnly=false",
  "--passWithNoTests=false",
];

test.each([
  ["apps/web/src/features/sign-in/index.tsx", "src/features/sign-in/index.test.tsx"],
  ["apps/web/src/features/navigation/pages.ts", "src/features/navigation/index.test.tsx"],
  [
    "apps/web/src/features/error-recovery/recovery-page.tsx",
    "src/features/error-recovery/index.test.tsx",
  ],
  ["apps/web/src/components/shell/app-header.tsx", "src/components/shell/index.test.tsx"],
  ["apps/web/src/components/ui/input-group.tsx", "src/components/ui/input-group.test.tsx"],
  ["apps/web/src/components/ui/sidebar.tsx", "src/components/ui/sidebar.test.tsx"],
  ["apps/web/src/components/ui/sidebar-state.ts", "src/components/ui/sidebar.test.tsx"],
])("scoped verification selects the public behavior check for %s", (path, behavior) => {
  expect(verificationPlan([edit(path!)])).toEqual([
    install,
    ["vp", "lint", path],
    selectedTests(behavior!),
  ]);
});
test("scoped verification deduplicates and orders checks for multiple frontend edits", () => {
  const paths = [
    "apps/web/src/components/shell/theme-switcher.tsx",
    "apps/web/src/components/shell/app-header.tsx",
    "apps/web/src/features/sign-in/index.tsx",
  ];
  const expected = [
    install,
    ["vp", "lint", ...[...paths].sort()],
    selectedTests("src/components/shell/index.test.tsx", "src/features/sign-in/index.test.tsx"),
  ];
  expect(verificationPlan(paths.map(edit))).toEqual(expected);
  expect(verificationPlan([...paths].reverse().map(edit))).toEqual(expected);
});
test("scoped verification retains behavior checks for deletions without linting missing files", () => {
  expect(
    verificationPlan([{ ...edit("apps/web/src/components/shell/app-header.tsx"), content: null }]),
  ).toEqual([install, selectedTests("src/components/shell/index.test.tsx")]);
});
test.each([
  "packages/core/src/index.ts",
  "packages/schema/src/index.ts",
  "apps/api/src/index.ts",
  "apps/web/src/components/ui/button.tsx",
  "apps/web/src/features/not-found/index.tsx",
  "apps/web/src/features/sign-in/floating-frames.module.css",
  "apps/web/src/features/sign-in/../navigation/pages.ts",
  "apps/web/src/features/sign-in/index.test.tsx",
])("unsupported scoped verification never falls back to a broad suite for %s", (path) => {
  expect(verificationPlan([edit(path)])).toBeNull();
});
test("unsupported scoped verification rejects mixed supported and unknown edits", () => {
  expect(
    verificationPlan([
      edit("apps/web/src/components/shell/index.tsx"),
      edit("packages/core/src/index.ts"),
    ]),
  ).toBeNull();
  expect(verificationPlan([])).toBeNull();
});
function input(path: string): {
  job: Job;
  output: { id: string; digest: string; result: unknown; selection: Job["selection"] };
} {
  const job: Job = {
    version: 1,
    id: "1".repeat(64),
    task: "fix",
    role: "codexImplementer",
    requester: snapshot.author,
    snapshot: { ...snapshot, files: [{ ...snapshot.files[0]!, path }], changedPaths: [path] },
    instructions: "Fix the value",
    thread: "",
    control: "e".repeat(40),
    selection: { provider: "openai", model: "fixture", effort: "high" },
    previous: "",
  };
  return {
    job,
    output: {
      id: job.id,
      digest: digest(job),
      selection: job.selection,
      result: { summary: "Fix value", edits: [edit(path)] },
    },
  };
}
test("unsupported scoped verification returns an honestly unavailable receipt without Docker", async () => {
  docker.calls.length = 0;
  const { job, output } = input("packages/core/src/value.ts");
  const receipt = await verify(job, output, "vinlandatelier/aircastle");
  expect(receipt).toMatchObject({
    passed: false,
    commands: null,
    recipe: digest(null),
    editsDigest: digest([edit("packages/core/src/value.ts")]),
  });
  expect(docker.calls).toEqual([]);
  expect(receipt.scope).toContain("unavailable");
});
test("scoped verification host receipt binds exactly the selected commands", async () => {
  docker.calls.length = 0;
  const path = "apps/web/src/components/shell/app-header.tsx";
  const { job, output } = input(path);
  const commands = [
    install,
    ["vp", "lint", path],
    selectedTests("src/components/shell/index.test.tsx"),
  ];
  const receipt = await verify(job, output, "vinlandatelier/aircastle");
  expect(receipt).toMatchObject({ passed: true, commands, recipe: digest(commands) });
  expect(docker.calls.map((args) => args[0])).toEqual(["build", "run", "rm"]);
});
test("the verification image takes its toolchain versions from the repository files", async () => {
  docker.calls.length = 0;
  const { job, output } = input("apps/web/src/components/shell/app-header.tsx");
  await verify(job, output, "vinlandatelier/aircastle");
  const version = (file: string) => readFileSync(file, "utf8").trim();
  const catalog = JSON.parse(readFileSync("package.json", "utf8")).catalog;
  expect(docker.calls[0]).toEqual(
    expect.arrayContaining([
      `NODE_VERSION=${version(".node-version")}`,
      `BUN_VERSION=${version(".bun-version")}`,
      `VITE_PLUS_VERSION=${catalog["vite-plus"]}`,
    ]),
  );
  expect(readFileSync("scripts/ai-automation/Dockerfile", "utf8")).not.toMatch(/\d+\.\d+\.\d+/);
});
