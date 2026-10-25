import { defineConfig } from "vite-plus";

export default defineConfig({
  resolve: { conditions: ["development"] },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    maxWorkers: 2,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reporter: ["text", "json-summary"],
      thresholds: { statements: 0, branches: 0, functions: 0, lines: 0 },
    },
  },
  pack: { entry: ["src/index.ts"], format: "esm", target: "es2022", dts: true, clean: true },
});
