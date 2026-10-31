import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test } from "vite-plus/test";

const root = fileURLToPath(new URL("../", import.meta.url));
const repository = resolve(root, "../..");
const compiler = resolve(dirname(fileURLToPath(import.meta.resolve("typescript"))), "../bin/tsc");
const directory = mkdtempSync(join(root, ".type-fixtures-"));

function compile(config: string, args: string[] = []) {
  try {
    return {
      status: 0,
      output: execFileSync(
        process.execPath,
        [compiler, "-p", config, "--pretty", "false", ...args],
        { cwd: root, encoding: "utf8", timeout: 30_000, stdio: "pipe" },
      ),
    };
  } catch (error) {
    if (
      error === null ||
      typeof error !== "object" ||
      !("status" in error) ||
      !("stdout" in error) ||
      !("stderr" in error)
    )
      throw error;
    if (typeof error.status !== "number") throw error;
    return { status: error.status, output: String(error.stdout) + String(error.stderr) };
  }
}

afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe.each(["source", "declarations"] as const)("%s browser auth contract", (target) => {
  test("retains exact schema outputs, assert and real ArkType error narrowing without server globals", () => {
    const config = join(directory, `${target}.json`);
    const fixture = join(root, "tests/types/auth-browser.ts");
    writeFileSync(
      config,
      JSON.stringify({
        extends: join(repository, "tsconfig.json"),
        compilerOptions: {
          customConditions: target === "source" ? ["development"] : [],
          skipLibCheck: false,
          types: [],
          lib: ["ES2022", "ES2022.Intl", "DOM", "DOM.Iterable"],
        },
        files: [fixture],
        include: [],
        exclude: [],
      }),
    );
    const graph = compile(config, ["--listFilesOnly"]);
    expect(graph.status, graph.output).toBe(0);
    const files = graph.output
      .split(/\r?\n/)
      .filter(Boolean)
      .map((file) => resolve(root, file));
    expect(files).toContain(fixture);
    expect(files).toContain(join(root, target === "source" ? "src/index.ts" : "dist/index.d.mts"));
    expect(files.some((file) => /[/\\](?:@types[/\\](?:node|bun)|bun-types)[/\\]/.test(file))).toBe(
      false,
    );
    if (target === "declarations") {
      for (const name of ["contracts", "schema", "client", "core", "adapter-postgres", "cli"]) {
        const source = join(repository, "packages", name, "src") + sep;
        expect(files.some((file) => file.startsWith(source))).toBe(false);
      }
    }
    const result = compile(config);
    expect(result.status, result.output).toBe(0);
  }, 30_000);
});
