import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, expect, test } from "vite-plus/test";

const root = fileURLToPath(new URL("../../", import.meta.url));
const directory = mkdtempSync(join(tmpdir(), "aircastle-schema-entry-"));
const schema = join(directory, "schema");
mkdirSync(join(directory, "node_modules/@aircastle"), { recursive: true });
mkdirSync(schema);
cpSync(join(root, "package.json"), join(schema, "package.json"));
cpSync(join(root, "src"), join(schema, "src"), { recursive: true });
symlinkSync(join(root, "node_modules"), join(schema, "node_modules"), "dir");
symlinkSync(schema, join(directory, "node_modules/@aircastle/schema"), "dir");

const consumer = (specifier: string) => `
  import { collection, compileSchema, text } from ${JSON.stringify(specifier)};
  const schema = compileSchema({ articles: collection({ title: text() }) });
  console.log(JSON.stringify(schema.articles.validate({ title: 'Development' })));
`;
writeFileSync(join(directory, "control.ts"), consumer("./schema/src/index.ts"));
writeFileSync(join(directory, "consumer.ts"), consumer("@aircastle/schema"));

afterAll(() => rmSync(directory, { recursive: true, force: true }));

test("Bun development consumers use schema source without build output", () => {
  const control = spawnSync("bun", ["--no-install", join(directory, "control.ts")], {
    cwd: directory,
    encoding: "utf8",
    timeout: 10_000,
  });
  expect({ error: control.error, status: control.status, stderr: control.stderr }).toEqual({
    error: undefined,
    status: 0,
    stderr: "",
  });
  const result = spawnSync(
    "bun",
    ["--no-install", "--conditions=development", join(directory, "consumer.ts")],
    { cwd: directory, encoding: "utf8", timeout: 10_000 },
  );
  expect({ error: result.error, status: result.status, stderr: result.stderr }).toEqual({
    error: undefined,
    status: 0,
    stderr: "",
  });
  expect(JSON.parse(result.stdout)).toEqual({ ok: true, data: { title: "Development" } });
});

test("normal consumers still resolve the packaged schema entry", () => {
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", 'console.log(import.meta.resolve("@aircastle/schema"))'],
    { cwd: directory, encoding: "utf8", timeout: 10_000 },
  );
  expect({ error: result.error, status: result.status, stderr: result.stderr }).toEqual({
    error: undefined,
    status: 0,
    stderr: "",
  });
  expect(new URL(result.stdout.trim()).pathname).toMatch(/\/dist\/index\.mjs$/);
});
