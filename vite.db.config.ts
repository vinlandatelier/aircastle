import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    include: ["scripts/postgres.integration.test.ts"],
    environment: "node",
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
