import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    maxWorkers: 2,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/cli.ts"],
      reporter: ["text", "json-summary"],
      thresholds: { statements: 92, branches: 85, functions: 100, lines: 95 },
    },
  },
});
