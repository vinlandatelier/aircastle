import { expect, test } from "vite-plus/test";
import { mutationScope } from "../../scripts/mutate-changed.ts";

const schema = {
  packageDir: "packages/schema",
  mutate: ["src/schema/**/*.ts", "!src/schema/contract.ts"],
  exists: () => true,
};

test("changes outside the package's test inputs skip mutation testing", () => {
  for (const changed of [
    [],
    ["apps/web/src/main.tsx", "packages/contracts/src/index.ts"],
    ["packages/schema-extra/src/schema/compile.ts"],
    ["packages/schema/scripts/classify-mutations.ts"],
  ]) {
    expect(mutationScope({ ...schema, changed }), changed.join()).toEqual({ kind: "skip" });
  }
});

test("changes limited to mutated source files mutate only those files", () => {
  expect(
    mutationScope({
      ...schema,
      changed: [
        "packages/schema/src/schema/compile.ts",
        "apps/web/src/main.tsx",
        "packages/schema/src/schema/formats.ts",
      ],
    }),
  ).toEqual({ kind: "files", files: ["src/schema/compile.ts", "src/schema/formats.ts"] });
});

test("changes to tests, configuration or unmutated sources mutate the whole package", () => {
  for (const file of [
    "tests/schema/compile.test.ts",
    "stryker.config.json",
    "vite.config.ts",
    "package.json",
    "src/index.ts",
    "src/schema/contract.ts",
  ]) {
    expect(
      mutationScope({
        ...schema,
        changed: ["packages/schema/src/schema/compile.ts", `packages/schema/${file}`],
      }),
      file,
    ).toEqual({ kind: "all" });
  }
});

test("deleting a mutated source file mutates the whole package", () => {
  expect(
    mutationScope({
      ...schema,
      changed: ["packages/schema/src/schema/formats.ts"],
      exists: (path) => path !== "packages/schema/src/schema/formats.ts",
    }),
  ).toEqual({ kind: "all" });
});
