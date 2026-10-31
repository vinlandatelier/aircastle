import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, expect, test } from "vite-plus/test";

const html = "<!doctype html><title>Aircastle</title><main>Application</main>";
const javascript = "console.log('asset');";
const paths = [
  "/setup",
  "/sign-in",
  "/development-inbox",
  "/dash",
  "/dash/workspaces",
  "/dash/workspaces/new",
  "/dash/workspaces/01234567-89ab-4cde-8fab-0123456789ab/projects",
];
const rejected = [
  "/api",
  "/api/auth/state",
  "/api/missing",
  "/%61pi/auth/state",
  "/assets/missing.js",
  "/missing.css",
  "/..%2fprivate.txt",
  "/%2e%2e%2fprivate.txt",
  "/%00",
  "/%5c..%5cprivate.txt",
  "/escape.txt",
  "/escape-dir/private.txt",
];
const cases = [
  ...paths.map((path) => ({ path, method: "GET", enabled: true })),
  ...rejected.map((path) => ({ path, method: "GET", enabled: true })),
  ...["/%", "/%E0%A4%A"].map((path) => ({ path, method: "GET", enabled: true })),
  { path: "/assets/main.js", method: "GET", enabled: true },
  { path: "/setup", method: "HEAD", enabled: true },
  { path: "/assets/main.js", method: "HEAD", enabled: true },
  { path: "/setup", method: "POST", enabled: true },
  { path: "/development-inbox", method: "GET", enabled: false },
  { path: "/development-inbox/nested", method: "GET", enabled: false },
  { path: "/development-inbox%2fnested", method: "GET", enabled: false },
  { path: "/setup", method: "GET", enabled: false },
];
const directory = mkdtempSync(join(tmpdir(), "aircastle-static-"));
type Result = { status: number; body: string; headers: Record<string, string> };
let results: Result[];

beforeAll(() => {
  const root = join(directory, "web");
  mkdirSync(join(root, "assets"), { recursive: true });
  writeFileSync(join(root, "index.html"), html);
  writeFileSync(join(root, "assets/main.js"), javascript);
  writeFileSync(join(directory, "private.txt"), "outside-secret");
  symlinkSync(join(directory, "private.txt"), join(root, "escape.txt"));
  symlinkSync(directory, join(root, "escape-dir"));
  const module = fileURLToPath(new URL("./static.ts", import.meta.url));
  const source = `
    import { createStaticHandler } from ${JSON.stringify(module)};
    const { root, cases } = await Bun.stdin.json();
    const handlers = [false, true].map(localAuthEnabled => createStaticHandler({root: new URL(root), localAuthEnabled}));
    const results = [];
    for (const item of cases) {
      const response = await handlers[Number(item.enabled)](new Request('http://localhost:8080' + item.path, {method: item.method}));
      results.push({status: response.status, body: await response.text(), headers: Object.fromEntries(response.headers)});
    }
    console.log(JSON.stringify(results));
  `;
  results = JSON.parse(
    execFileSync("bun", ["-e", source], {
      input: JSON.stringify({ root: pathToFileURL(`${root}/`).href, cases }),
      encoding: "utf8",
      timeout: 10_000,
    }),
  );
  expect(results).toHaveLength(cases.length);
});

afterAll(() => rmSync(directory, { recursive: true, force: true }));

function result(path: string, method = "GET", enabled = true) {
  const index = cases.findIndex(
    (item) => item.path === path && item.method === method && item.enabled === enabled,
  );
  expect(index).toBeGreaterThanOrEqual(0);
  return results[index]!;
}

for (const path of paths)
  test(`static SPA refresh ${path} serves HTML with no-referrer`, () => {
    expect(result(path)).toMatchObject({
      status: 200,
      body: html,
      headers: { "referrer-policy": "no-referrer" },
    });
    expect(result(path).headers["content-type"]).toMatch(/^text\/html(?:;|$)/);
  });

for (const path of rejected)
  test(`static boundary rejects ${path} without HTML or outside content`, () => {
    expect(result(path)).toMatchObject({ status: 404, body: "" });
  });

for (const path of ["/%", "/%E0%A4%A"])
  test(`static boundary rejects malformed encoding ${path}`, () => {
    expect(result(path)).toMatchObject({ status: 400, body: "" });
  });

test("static asset GET serves the file with its media type", () => {
  const asset = result("/assets/main.js");
  expect(asset).toMatchObject({ status: 200, body: javascript });
  expect(asset.headers["content-type"]).toMatch(/^(text|application)\/javascript/);
});

for (const [path, content] of [
  ["/setup", html],
  ["/assets/main.js", javascript],
] as const)
  test(`static HEAD ${path} preserves representation length without a body`, () => {
    expect(result(path, "HEAD")).toMatchObject({
      status: 200,
      body: "",
      headers: {
        "content-length": String(Buffer.byteLength(content)),
        "referrer-policy": "no-referrer",
      },
    });
  });

test("static POST cannot be handled as SPA navigation", () => {
  expect(result("/setup", "POST")).toMatchObject({
    status: 405,
    body: "",
    headers: { allow: "GET, HEAD" },
  });
});

for (const path of [
  "/development-inbox",
  "/development-inbox/nested",
  "/development-inbox%2fnested",
])
  test(`static disabled inbox ${path} returns HTTP 404`, () => {
    expect(result(path, "GET", false)).toMatchObject({ status: 404, body: "" });
  });

test("static disabled auth still serves the configuration screen entry", () => {
  expect(result("/setup", "GET", false)).toMatchObject({ status: 200, body: html });
});
