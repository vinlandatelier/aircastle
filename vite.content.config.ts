import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: [
            "packages/contracts/src/**/*.test.ts",
            "packages/client/src/**/*.test.ts",
            "packages/cli/src/**/*.test.ts",
            "packages/core/src/**/*.test.ts",
            "apps/api/src/features/content/**/*.test.ts",
            "apps/api/src/runtime.test.ts",
          ],
          exclude: ["**/*.integration.test.ts"],
          environment: "node",
          maxWorkers: 2,
        },
      },
      {
        test: {
          name: "database",
          include: [
            "packages/adapter-postgres/src/**/*.test.ts",
            "packages/core/src/**/*.integration.test.ts",
            "tests/content-workflow.test.ts",
            "scripts/dev-setup.test.ts",
          ],
          environment: "node",
          maxWorkers: 2,
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
