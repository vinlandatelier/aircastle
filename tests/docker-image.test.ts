import { readFileSync } from "node:fs";
import { expect, test } from "vite-plus/test";

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("the application image uses the repository's pinned Bun and Node versions", () => {
  const images = [...read("Dockerfile").matchAll(/^FROM (\S+)/gm)].map((match) => match[1]);
  expect(images).toContain(`oven/bun:${read(".bun-version").trim()}-slim`);
  expect(images).toContain(`node:${read(".node-version").trim()}-bookworm-slim`);
});
