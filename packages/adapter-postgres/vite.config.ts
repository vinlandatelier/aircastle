import { defineConfig } from "vite-plus";

export default defineConfig({
  test: { include: ["src/**/*.test.ts"], environment: "node", maxWorkers: 2 },
  pack: { entry: ["src/index.ts"], format: "esm", target: "es2022", dts: true, clean: true },
});
