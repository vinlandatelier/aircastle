import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { expect, test } from "vite-plus/test";

interface Workspace {
  readonly dir: string;
  readonly name: string;
  readonly scripts: Readonly<Record<string, string>>;
}

interface RecipeSource {
  readonly origin: string;
  readonly dir: string;
  readonly text: string;
}

const trackedFiles = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n")
  .filter((file) => file.length > 0);

const workspaces: readonly Workspace[] = trackedFiles
  .filter((file) => file.endsWith("package.json"))
  .map((file) => {
    const manifest: { name: string; scripts?: Record<string, string> } = JSON.parse(
      readFileSync(file, "utf8"),
    );
    return { dir: dirname(file), name: manifest.name, scripts: manifest.scripts ?? {} };
  });

const vendoredSkills = /^\.(agents|claude)\/skills\//;
const documentation =
  /\.md$|^\.github\/workflows\/[^/]+\.yml$|^\.github\/actions\/.+\/action\.yml$/;
const literalScriptName = /^[\w@][\w@:./#-]*$/;

const documentSources: readonly RecipeSource[] = trackedFiles
  .filter((file) => documentation.test(file) && !vendoredSkills.test(file))
  .map((file) => ({ origin: file, dir: ".", text: readFileSync(file, "utf8") }));

const scriptSources: readonly RecipeSource[] = workspaces.flatMap((workspace) =>
  Object.entries(workspace.scripts).map(([name, text]) => ({
    origin: `${join(workspace.dir, "package.json")} scripts.${name}`,
    dir: workspace.dir,
    text,
  })),
);

function unquote(token: string): string {
  return token.replace(/^['"]|['"]$/g, "");
}

function globMatches(pattern: string, value: string): boolean {
  const escaped = pattern.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`^${escaped.join("[^/]*")}$`).test(value);
}

function filterMatches(filter: string, workspace: Workspace): boolean {
  return filter.startsWith("./")
    ? globMatches(normalize(filter), workspace.dir)
    : globMatches(filter, workspace.name);
}

function unresolvedRecipes(source: RecipeSource): string[] {
  const failures: string[] = [];
  for (const match of source.text.matchAll(/\bvp(?:\s+-C\s+(\S+))?\s+run\b([^\n`|&;)]*)/g)) {
    const tokens = (match[2] ?? "").trim().split(/\s+/).filter(Boolean).map(unquote);
    const filters: string[] = [];
    let task: string | undefined;
    for (let index = 0; index < tokens.length && task === undefined; index++) {
      const token = tokens[index] ?? "";
      const [flag, inlineValue] = token.split("=", 2);
      if (flag === "-F" || flag === "--filter") {
        filters.push(unquote(inlineValue ?? tokens[++index] ?? ""));
      } else if (!token.startsWith("-")) {
        task = token;
      }
    }
    if (task === undefined || !literalScriptName.test(task)) continue;
    const packageDir = normalize(join(source.dir, match[1] ?? "."));
    const candidates = workspaces.filter((workspace) =>
      filters.length > 0
        ? filters.some((filter) => filterMatches(filter, workspace))
        : workspace.dir === packageDir,
    );
    if (!candidates.some((workspace) => Object.hasOwn(workspace.scripts, task))) {
      failures.push(`${source.origin}: ${match[0].trim()}`);
    }
  }
  return failures;
}

test("every vp run recipe names an existing package script", () => {
  expect([...documentSources, ...scriptSources].flatMap(unresolvedRecipes)).toEqual([]);
});

test("documentation and workflows run package scripts with vp run, not bun run", () => {
  const scriptNames = new Set(workspaces.flatMap((workspace) => Object.keys(workspace.scripts)));
  const failures = documentSources.flatMap((source) =>
    [...source.text.matchAll(/\bbun\s+run(?:\s+-\S*)*\s+([^\s`'"-][^\s`'"]*)/g)]
      .filter((match) => scriptNames.has(match[1] ?? ""))
      .map((match) => `${source.origin}: ${match[0]}`),
  );
  expect(failures).toEqual([]);
});
