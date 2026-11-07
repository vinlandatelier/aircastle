import { defineConfig } from "vite-plus";

export default defineConfig({
  resolve: { conditions: ["development"] },
  test: {
    include: ["tests/auth-image.journey.ts"],
    environment: "node",
    testTimeout: 300_000,
    hookTimeout: 900_000,
  },
});
