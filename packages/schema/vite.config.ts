import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    maxWorkers: 2,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reporter: ["text", "lcov", "json-summary"],
      thresholds: { statements: 98, branches: 96, functions: 100, lines: 98 },
    },
  },
  pack: {
    entry: ["src/index.ts"],
    format: "esm",
    target: "es2022",
    dts: true,
    clean: true,
  },
});
