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
      exclude: ["src/cli.ts"],
      reporter: ["text", "json-summary"],
      thresholds: { statements: 83, branches: 84, functions: 93, lines: 84 },
    },
  },
  pack: { entry: ["src/index.ts"], format: "esm", target: "es2022", dts: true, clean: true },
});
