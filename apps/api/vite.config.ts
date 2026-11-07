import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    maxWorkers: 2,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
