import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["src/index.ts"],
    format: "esm",
    target: "es2022",
    dts: true,
    clean: true,
  },
});
