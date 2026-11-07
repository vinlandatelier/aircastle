import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    include: ["tests/auth-image.journey.ts"],
    environment: "node",
    testTimeout: 300_000,
    hookTimeout: 900_000,
  },
});
