import { defineConfig } from "vite-plus";

export default defineConfig({
  resolve: { conditions: ["development"] },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    maxWorkers: 2,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/test-support/**"],
      reporter: ["text", "json-summary"],
      thresholds: { statements: 92, branches: 85, functions: 97, lines: 94 },
    },
  },
  pack: { entry: ["src/index.ts"], format: "esm", target: "es2022", dts: true, clean: true },
});
